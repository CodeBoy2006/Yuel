import { browser } from 'wxt/browser';

import {
  createPdfReadingPageId,
  getPdfReadingDomain,
} from './analytics/identity';
import type { PdfSourceMetadata } from './source';

export const PDF_READER_SESSION_STORAGE_PREFIX = 'yuel.pdfReaderSession.';
const PDF_READER_PATH = '/pdf-reader.html';

export interface PdfReaderSessionContext {
  tabId: number;
  resourceId: string;
  pageId: string;
  displayName: string;
  domain: string;
  updatedAt: number;
}

export type CurrentPdfReaderState =
  | { active: false }
  | {
    active: true;
    tabId?: number;
    session?: PdfReaderSessionContext;
  };

interface PdfReaderSessionTab {
  id?: number;
  url?: string;
}

interface PdfReaderSessionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PdfReaderSessionRuntime {
  runtime: {
    getURL(path: string): string;
  };
  tabs: {
    getCurrent(): Promise<PdfReaderSessionTab | undefined>;
    query(queryInfo: {
      active: true;
      currentWindow?: true;
      lastFocusedWindow?: true;
    }): Promise<PdfReaderSessionTab[]>;
  };
  storage: {
    session: PdfReaderSessionStorage;
  };
}

let sessionMutationQueue: Promise<void> = Promise.resolve();

export function getPdfReaderSessionStorageKey(tabId: number): string {
  if (!Number.isSafeInteger(tabId) || tabId < 0) {
    throw new RangeError('PDF reader session tab IDs must be non-negative integers.');
  }
  return `${PDF_READER_SESSION_STORAGE_PREFIX}${tabId}`;
}

export function isPdfReaderSessionStorageKey(key: string): boolean {
  return key.startsWith(PDF_READER_SESSION_STORAGE_PREFIX);
}

export async function publishPdfReaderSession(
  metadata: PdfSourceMetadata,
  runtime: PdfReaderSessionRuntime = browser as unknown as PdfReaderSessionRuntime,
  now = Date.now(),
): Promise<PdfReaderSessionContext | undefined> {
  return enqueueSessionMutation(async () => {
    const tab = await runtime.tabs.getCurrent();
    if (typeof tab?.id !== 'number') return undefined;

    const context: PdfReaderSessionContext = {
      tabId: tab.id,
      resourceId: metadata.resourceId,
      pageId: createPdfReadingPageId(metadata),
      displayName: metadata.displayName,
      domain: getPdfReadingDomain(metadata),
      updatedAt: now,
    };
    await runtime.storage.session.set({
      [getPdfReaderSessionStorageKey(tab.id)]: context,
    });
    return context;
  });
}

export async function clearPdfReaderSession(
  resourceId: string,
  runtime: PdfReaderSessionRuntime = browser as unknown as PdfReaderSessionRuntime,
): Promise<void> {
  await enqueueSessionMutation(async () => {
    const tab = await runtime.tabs.getCurrent();
    if (typeof tab?.id !== 'number') return;

    const key = getPdfReaderSessionStorageKey(tab.id);
    const stored = await runtime.storage.session.get(key);
    const context = readPdfReaderSessionContext(stored[key], tab.id);
    if (context?.resourceId === resourceId) {
      await runtime.storage.session.remove(key);
    }
  });
}

export async function getCurrentPdfReaderState(
  runtime: PdfReaderSessionRuntime = browser as unknown as PdfReaderSessionRuntime,
): Promise<CurrentPdfReaderState> {
  const tab = await getActivePdfReaderTab(runtime);
  if (!tab) return { active: false };
  if (typeof tab.id !== 'number') return { active: true };

  const key = getPdfReaderSessionStorageKey(tab.id);
  const stored = await runtime.storage.session.get(key);
  const session = readPdfReaderSessionContext(stored[key], tab.id);
  return {
    active: true,
    tabId: tab.id,
    ...(session ? { session } : {}),
  };
}

function enqueueSessionMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = sessionMutationQueue.then(operation, operation);
  sessionMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function getActivePdfReaderTab(
  runtime: PdfReaderSessionRuntime,
): Promise<PdfReaderSessionTab | undefined> {
  const [lastFocusedTab] = await runtime.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (isPdfReaderTab(lastFocusedTab, runtime)) {
    return lastFocusedTab;
  }

  const [currentWindowTab] = await runtime.tabs.query({
    active: true,
    currentWindow: true,
  });
  return isPdfReaderTab(currentWindowTab, runtime)
    ? currentWindowTab
    : undefined;
}

function isPdfReaderTab(
  tab: PdfReaderSessionTab | undefined,
  runtime: PdfReaderSessionRuntime,
): tab is PdfReaderSessionTab {
  if (!tab?.url) return false;

  try {
    const expected = new URL(runtime.runtime.getURL(PDF_READER_PATH));
    const candidate = new URL(tab.url);
    return (
      candidate.origin === expected.origin
      && candidate.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}

function readPdfReaderSessionContext(
  value: unknown,
  tabId: number,
): PdfReaderSessionContext | undefined {
  if (
    typeof value !== 'object'
    || value === null
    || !('tabId' in value)
    || value.tabId !== tabId
    || !('resourceId' in value)
    || typeof value.resourceId !== 'string'
    || !/^pdf_[a-f0-9]{64}$/.test(value.resourceId)
    || !('pageId' in value)
    || typeof value.pageId !== 'string'
    || value.pageId.trim().length === 0
    || !('displayName' in value)
    || typeof value.displayName !== 'string'
    || value.displayName.trim().length === 0
    || !('domain' in value)
    || typeof value.domain !== 'string'
    || value.domain.trim().length === 0
    || !('updatedAt' in value)
    || typeof value.updatedAt !== 'number'
    || !Number.isFinite(value.updatedAt)
    || value.updatedAt < 0
  ) {
    return undefined;
  }

  return {
    tabId,
    resourceId: value.resourceId,
    pageId: value.pageId,
    displayName: value.displayName,
    domain: value.domain,
    updatedAt: value.updatedAt,
  };
}
