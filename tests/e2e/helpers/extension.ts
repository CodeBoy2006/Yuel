import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

import {
  isReadingCollectorStatusResponse,
  MESSAGE_TYPES,
  type ReadingCollectorStatusRequest,
  type ReadingCollectorStatusResponse,
  type ReadingEventBatchMessage,
} from '../../../src/messaging/contracts';
import type { SavedItemRecord } from '../../../src/storage/schema';
import { READING_SITE_HOST } from './readingSite';

const EXTENSION_PATH = path.resolve(process.cwd(), '.output/chrome-mv3');

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  extensionWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({ headless }, use) => {
    await access(path.join(EXTENSION_PATH, 'manifest.json'));
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'yuel-playwright-extension-'));
    let context: BrowserContext | undefined;

    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless,
        ignoreHTTPSErrors: true,
        locale: 'en-US',
        viewport: { width: 1_440, height: 1_040 },
        args: [
          `--disable-extensions-except=${EXTENSION_PATH}`,
          `--load-extension=${EXTENSION_PATH}`,
          '--allow-insecure-localhost',
          '--ignore-certificate-errors',
          '--no-proxy-server',
          `--host-resolver-rules=MAP ${READING_SITE_HOST} 127.0.0.1`,
        ],
      });
      await use(context);
    } finally {
      await context?.close();
      await rm(userDataDir, { force: true, recursive: true });
    }
  },

  extensionWorker: async ({ context }, use) => {
    const extensionWorker = context.serviceWorkers()[0]
      ?? await context.waitForEvent('serviceworker', { timeout: 15_000 });
    await use(extensionWorker);
  },

  extensionId: async ({ extensionWorker }, use) => {
    const workerUrl = new URL(extensionWorker.url());
    if (workerUrl.protocol !== 'chrome-extension:' || !workerUrl.hostname) {
      throw new Error(`Unexpected extension service worker URL: ${workerUrl.href}`);
    }
    await use(workerUrl.hostname);
  },
});

export { expect };

export async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  pathname: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pathname}`, { waitUntil: 'load' });
  return page;
}

export async function installPdfCompanionBrowserStubs(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    class TestTranslator {
      static create(options: {
        monitor?: (monitor: {
          addEventListener: (
            type: 'downloadprogress',
            listener: (event: Event & { loaded: number }) => void,
          ) => void;
        }) => void;
      }) {
        options.monitor?.({
          addEventListener: (_type, listener) => {
            listener(Object.assign(new Event('downloadprogress'), {
              loaded: 1,
            }));
          },
        });
        return Promise.resolve({
          translate: async (text: string) => `本地译文：${text}`,
          destroy: () => undefined,
        });
      }
    }

    class TestSpeechSynthesisUtterance {
      lang = '';
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onstart: (() => void) | null = null;
      pitch = 1;
      rate = 1;
      text: string;
      voice: SpeechSynthesisVoice | null = null;

      constructor(text = '') {
        this.text = text;
      }
    }

    Object.defineProperty(globalThis, 'Translator', {
      configurable: true,
      value: TestTranslator,
    });
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: TestSpeechSynthesisUtterance,
    });
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => undefined,
        getVoices: () => [],
        speak: (utterance: TestSpeechSynthesisUtterance) => {
          queueMicrotask(() => utterance.onstart?.());
        },
      },
    });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (globalThis as typeof globalThis & {
            __yuelClipboardText?: string;
          }).__yuelClipboardText = text;
        },
      },
    });
  });
}

export async function readExtensionPageText(
  context: BrowserContext,
  extensionId: string,
  pathname: string,
): Promise<string> {
  const page = await openExtensionPage(context, extensionId, pathname);
  try {
    return await page.locator('body').innerText();
  } finally {
    await page.close();
  }
}

export async function sendExtensionRuntimeMessage(
  page: Page,
  message: ReadingEventBatchMessage,
): Promise<void> {
  await page.evaluate((payload) => {
    type RuntimeResponse = { ok?: boolean } | undefined;
    type ChromeRuntime = {
      lastError?: { message?: string };
      sendMessage: (message: unknown, callback: (response: RuntimeResponse) => void) => void;
    };

    const runtime = (globalThis as typeof globalThis & { chrome: { runtime: ChromeRuntime } }).chrome.runtime;

    return new Promise<void>((resolve, reject) => {
      runtime.sendMessage(payload, (response) => {
        const lastErrorMessage = runtime.lastError?.message;
        if (
          lastErrorMessage
          && !lastErrorMessage.includes('The message port closed before a response was received')
        ) {
          reject(new Error(lastErrorMessage));
          return;
        }

        if (response?.ok !== true) {
          reject(new Error('Yuel background rejected the runtime smoke batch'));
          return;
        }

        resolve();
      });
    });
  }, message);
}

export async function seedSavedItems(
  page: Page,
  records: SavedItemRecord[],
): Promise<void> {
  await page.evaluate(async (items) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('yuel-local');
      request.onerror = () => reject(request.error ?? new Error('Failed to open Yuel IndexedDB'));
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('savedItems', 'readwrite');
        const store = transaction.objectStore('savedItems');
        items.forEach((item) => store.put(item));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(
          transaction.error ?? new Error('Failed to seed saved excerpts'),
        );
        transaction.onabort = () => reject(
          transaction.error ?? new Error('Saved excerpt seed transaction was aborted'),
        );
      });
    } finally {
      database.close();
    }
  }, records);
}

export async function readActiveTabCollectorStatus(worker: Worker): Promise<ReadingCollectorStatusResponse> {
  const request: ReadingCollectorStatusRequest = {
    type: MESSAGE_TYPES.readingCollectorStatusRequest,
  };

  const response = await worker.evaluate<unknown, ReadingCollectorStatusRequest>(async (payload) => {
    type ChromeApi = {
      runtime: { lastError?: { message?: string } };
      tabs: {
        query: (query: { active: boolean; lastFocusedWindow: boolean }) => Promise<Array<{ id?: number }>>;
        sendMessage: (
          tabId: number,
          message: unknown,
          callback: (response: ReadingCollectorStatusResponse | undefined) => void,
        ) => void;
      };
    };

    const chromeApi = (globalThis as typeof globalThis & { chrome: ChromeApi }).chrome;
    const [activeTab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
    if (typeof activeTab?.id !== 'number') {
      throw new Error('Playwright extension context has no active browser tab');
    }

    return new Promise<unknown>((resolve, reject) => {
      chromeApi.tabs.sendMessage(activeTab.id!, payload, (response) => {
        const lastErrorMessage = chromeApi.runtime.lastError?.message;
        if (lastErrorMessage) {
          reject(new Error(lastErrorMessage));
        } else if (!response) {
          reject(new Error('Active tab did not return a collector status response'));
        } else {
          resolve(response);
        }
      });
    });
  }, request);

  if (!isReadingCollectorStatusResponse(response)) {
    throw new Error(`Active tab returned an invalid collector status: ${JSON.stringify(response)}`);
  }
  return response;
}

export async function readReadingToolbarActionState(
  worker: Worker,
): Promise<{ title: string; badgeText: string }> {
  return worker.evaluate(async () => {
    type ChromeActionApi = {
      getBadgeText: (details: Record<string, never>) => Promise<string>;
      getTitle: (details: Record<string, never>) => Promise<string>;
    };

    const action = (globalThis as typeof globalThis & {
      chrome: { action: ChromeActionApi };
    }).chrome.action;
    const [title, badgeText] = await Promise.all([
      action.getTitle({}),
      action.getBadgeText({}),
    ]);

    return { title, badgeText };
  });
}
