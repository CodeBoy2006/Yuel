import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { hashText } from '../src/domain/events';
import { MESSAGE_TYPES, type ReadingEventBatchMessage, type ReadingEventBatchPayload } from '../src/messaging/contracts';

export interface BrowserLoadedSmokeResult {
  extensionId: string;
  dashboardText: string;
  popupText: string;
}

export interface BrowserRuntimeReadingLoopSmokeResult {
  extensionId: string;
  dashboardText: string;
}

interface BrowserLoadedSmokeOptions {
  chromePath?: string;
  headless?: boolean;
  timeoutMs?: number;
}

interface CdpTargetInfo {
  targetId: string;
  type: string;
  url: string;
}

interface ExtensionInfo {
  enabled: boolean;
  id: string;
  name: string;
  path: string;
  version: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAC_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUNTIME_LOOP_DOMAIN = 'runtime-loop.example';

export async function validateBrowserLoadedExtension(
  outputDir: string,
  options: BrowserLoadedSmokeOptions = {},
): Promise<BrowserLoadedSmokeResult> {
  return withLoadedExtension(outputDir, options, async ({ client, extensionId, timeoutMs }) => {
    const dashboardText = await client.readPageText(`chrome-extension://${extensionId}/dashboard.html`, timeoutMs);
    const popupText = await client.readPageText(`chrome-extension://${extensionId}/popup.html`, timeoutMs);

    return { extensionId, dashboardText, popupText };
  });
}

export async function validateBrowserRuntimeReadingLoop(
  outputDir: string,
  options: BrowserLoadedSmokeOptions = {},
): Promise<BrowserRuntimeReadingLoopSmokeResult> {
  return withLoadedExtension(outputDir, options, async ({ client, extensionId, timeoutMs }) => {
    const dashboardUrl = `chrome-extension://${extensionId}/dashboard.html`;
    await client.sendExtensionRuntimeMessage(dashboardUrl, createRuntimeReadingBatchMessage(), timeoutMs);

    const dashboardText = await waitFor(async () => {
      const text = await client.readPageText(dashboardUrl, timeoutMs);
      if (text.includes(RUNTIME_LOOP_DOMAIN) && !text.includes('No reading data yet')) {
        return text;
      }

      throw new Error(`Dashboard did not show runtime reading data yet:\n${text.slice(0, 1_000)}`);
    }, timeoutMs);

    return { extensionId, dashboardText };
  });
}

async function withLoadedExtension<T>(
  outputDir: string,
  {
    chromePath = process.env.CHROME_PATH ?? MAC_CHROME_PATH,
    headless = process.env.YUEL_BROWSER_SMOKE_HEADLESS === 'true',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: BrowserLoadedSmokeOptions,
  runSmoke: (context: { client: CdpClient; extensionId: string; timeoutMs: number }) => Promise<T>,
): Promise<T> {
  const extensionDir = path.resolve(outputDir);
  await access(path.join(extensionDir, 'manifest.json'));
  await access(chromePath);

  const userDataDir = await mkdtemp(path.join(tmpdir(), 'yuel-extension-smoke-'));
  const chrome = launchChrome(chromePath, userDataDir, headless);
  const chromeLogs = collectProcessLogs(chrome);

  try {
    const browserWsUrl = await waitForBrowserWebSocketUrl(userDataDir, timeoutMs);
    const client = await CdpClient.connect(browserWsUrl);

    try {
      const extensionId = await client.loadUnpackedExtension(extensionDir, timeoutMs);
      return await runSmoke({ client, extensionId, timeoutMs });
    } finally {
      client.close();
    }
  } catch (error) {
    const logs = chromeLogs();
    if (!logs) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nChrome output:\n${logs}`);
  } finally {
    await stopChrome(chrome);
    await rm(userDataDir, { force: true, recursive: true });
  }
}

function createRuntimeReadingBatchMessage(now = Date.now()): ReadingEventBatchMessage {
  return {
    type: MESSAGE_TYPES.readingEventsBatch,
    payload: createRuntimeReadingBatchPayload(now),
  };
}

function createRuntimeReadingBatchPayload(now: number): ReadingEventBatchPayload {
  const url = `https://${RUNTIME_LOOP_DOMAIN}/local-first-browser-reading`;
  const pageId = `${RUNTIME_LOOP_DOMAIN}_${hashText(url)}`;
  const chunkText =
    'Architecture performance guides help local first browser extensions measure reading behavior and vocabulary exposure safely.';
  const chunkId = `${pageId}_${hashText(chunkText)}`;
  const sessionId = `browser_smoke_${now}`;

  return {
    page: {
      pageId,
      domain: RUNTIME_LOOP_DOMAIN,
      titleHash: hashText('Runtime reading loop'),
      urlHash: hashText(url),
      language: 'en',
      totalWords: 14,
      capturedAt: now,
    },
    chunks: [
      {
        chunkId,
        pageId,
        textHash: hashText(chunkText),
        text: chunkText,
        wordCount: 14,
        sentenceCount: 1,
        selector: 'article > p:nth-of-type(1)',
      },
    ],
    events: [
      {
        id: `browser_smoke_visible_${now}`,
        sessionId,
        pageId,
        kind: 'PageVisible',
        occurredAt: now,
        confidence: 'medium',
      },
      {
        id: `browser_smoke_text_visible_${now}`,
        sessionId,
        pageId,
        chunkId,
        kind: 'TextBlockVisible',
        occurredAt: now + 1,
        confidence: 'high',
        value: {
          visibleRatio: 1,
          wordCount: 14,
        },
      },
      {
        id: `browser_smoke_exposure_${now}`,
        sessionId,
        pageId,
        chunkId,
        kind: 'TextBlockExposureTick',
        occurredAt: now + 60_000,
        confidence: 'high',
        value: {
          dwellMs: 60_000,
          visibleRatio: 1,
          wordCount: 14,
          activeTab: true,
          scrollSpeedWordsPerMinute: 180,
          idle: false,
        },
      },
    ],
  };
}

function collectProcessLogs(chrome: ChildProcessWithoutNullStreams): () => string {
  const chunks: string[] = [];
  const append = (chunk: Buffer) => {
    chunks.push(chunk.toString('utf8'));
    while (chunks.join('').length > 8_000) {
      chunks.shift();
    }
  };

  chrome.stdout.on('data', append);
  chrome.stderr.on('data', append);

  return () => chunks.join('').trim();
}

function launchChrome(chromePath: string, userDataDir: string, headless: boolean): ChildProcessWithoutNullStreams {
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ];

  if (headless) {
    args.unshift('--headless=new');
  }

  return spawn(chromePath, args);
}

async function waitForBrowserWebSocketUrl(userDataDir: string, timeoutMs: number): Promise<string> {
  const activePortPath = path.join(userDataDir, 'DevToolsActivePort');
  const [port, browserPath] = await waitFor(async () => {
    const content = await readFile(activePortPath, 'utf8');
    const lines = content.trim().split('\n');
    if (!lines[0] || !lines[1]) {
      throw new Error('DevToolsActivePort is incomplete');
    }

    return lines;
  }, timeoutMs);

  return `ws://127.0.0.1:${port}${browserPath}`;
}

async function describeLoadedBrowserState(client: CdpClient): Promise<string> {
  const { targetInfos } = await client.send<{ targetInfos: CdpTargetInfo[] }>('Target.getTargets');
  const targetSummary = targetInfos.map((target) => `${target.type}:${target.url || '<empty>'}`).join('\n');
  const extensionSummary = await readUnpackedExtensionSummary(client);

  return [
    'CDP targets:',
    targetSummary || '<none>',
    'Unpacked extensions:',
    extensionSummary || '<none>',
  ].join('\n');
}

async function readUnpackedExtensionSummary(client: CdpClient): Promise<string> {
  try {
    const { extensions } = await client.send<{ extensions: ExtensionInfo[] }>('Extensions.getExtensions');

    return extensions
      .map((extension) => `${extension.id}:enabled=${extension.enabled} path=${extension.path}`)
      .join('\n');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function stopChrome(chrome: ChildProcessWithoutNullStreams): Promise<void> {
  if (chrome.exitCode !== null || chrome.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      chrome.kill('SIGKILL');
      resolve();
    }, 2_000);

    chrome.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    chrome.kill('SIGTERM');
  });
}

async function waitFor<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for browser smoke condition');
}

class CdpClient {
  private nextMessageId = 1;
  private readonly pendingMessages = new Map<number, { reject: (error: Error) => void; resolve: (value: unknown) => void }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        error?: { message?: string };
        result?: unknown;
      };

      if (!message.id) {
        return;
      }

      const pending = this.pendingMessages.get(message.id);
      if (!pending) {
        return;
      }

      this.pendingMessages.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? 'Chrome DevTools Protocol error'));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  static async connect(webSocketUrl: string): Promise<CdpClient> {
    const socket = new WebSocket(webSocketUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('Failed to connect to Chrome DevTools Protocol')), { once: true });
    });

    return new CdpClient(socket);
  }

  async send<T>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T> {
    const id = this.nextMessageId;
    this.nextMessageId += 1;

    const response = new Promise<T>((resolve, reject) => {
      this.pendingMessages.set(id, {
        reject,
        resolve: (value) => resolve(value as T),
      });
    });

    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return response;
  }

  async readPageText(url: string, timeoutMs: number): Promise<string> {
    return this.withPage(url, timeoutMs, async (sessionId) => {
      const text = await waitFor(async () => {
        const pageText = await this.evaluate<string>('document.body?.innerText ?? ""', sessionId);
        if (!pageText.trim()) {
          throw new Error('Page text is empty');
        }

        return pageText;
      }, timeoutMs);

      return text;
    });
  }

  async sendExtensionRuntimeMessage(url: string, message: ReadingEventBatchMessage, timeoutMs: number): Promise<void> {
    await this.withPage(url, timeoutMs, async (sessionId) => {
      await this.evaluate(
        `(() => new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(${JSON.stringify(message)}, () => {
            const lastError = chrome.runtime.lastError;
            if (lastError?.message && !lastError.message.includes('The message port closed before a response was received')) {
              reject(new Error(lastError.message));
              return;
            }

            resolve(true);
          });
        }))()`,
        sessionId,
        { awaitPromise: true },
      );
    });
  }

  async loadUnpackedExtension(extensionDir: string, timeoutMs: number): Promise<string> {
    const { id } = await this.send<{ id: string }>('Extensions.loadUnpacked', { path: extensionDir });

    return waitFor(async () => {
      const { extensions } = await this.send<{ extensions: ExtensionInfo[] }>('Extensions.getExtensions');
      const loadedExtension = extensions.find(
        (extension) => extension.id === id && extension.enabled && path.resolve(extension.path) === extensionDir,
      );
      if (!loadedExtension) {
        throw new Error(`Unpacked extension was not enabled after load: ${id}\n${await describeLoadedBrowserState(this)}`);
      }

      return id;
    }, timeoutMs);
  }

  close(): void {
    this.socket.close();
  }

  private async withPage<T>(url: string, timeoutMs: number, readPage: (sessionId: string) => Promise<T>): Promise<T> {
    const { targetId } = await this.send<{ targetId: string }>('Target.createTarget', { url });
    const { sessionId } = await this.send<{ sessionId: string }>('Target.attachToTarget', {
      flatten: true,
      targetId,
    });

    try {
      await this.waitForPageReady(sessionId, timeoutMs);
      return await readPage(sessionId);
    } finally {
      await this.send('Target.closeTarget', { targetId });
    }
  }

  private async waitForPageReady(sessionId: string, timeoutMs: number): Promise<void> {
    await waitFor(async () => {
      const readyState = await this.evaluate<string>('document.readyState', sessionId);
      if (readyState !== 'complete') {
        throw new Error(`Page is not ready: ${readyState}`);
      }
    }, timeoutMs);
  }

  private async evaluate<T>(
    expression: string,
    sessionId: string,
    { awaitPromise = false }: { awaitPromise?: boolean } = {},
  ): Promise<T> {
    const { result, exceptionDetails } = await this.send<{
      result: { value: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>(
      'Runtime.evaluate',
      {
        awaitPromise,
        expression,
        returnByValue: true,
      },
      sessionId,
    );

    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'Runtime evaluation failed');
    }

    return result.value;
  }
}
