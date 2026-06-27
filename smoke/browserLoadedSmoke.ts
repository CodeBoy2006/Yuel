import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';

import { hashText } from '../src/domain/events';
import { MESSAGE_TYPES, type ReadingEventBatchMessage, type ReadingEventBatchPayload } from '../src/messaging/contracts';

export interface BrowserLoadedSmokeResult {
  extensionId: string;
  dashboardText: string;
  popupText: string;
  sidePanelText: string;
}

export interface BrowserRuntimeReadingLoopSmokeResult {
  extensionId: string;
  dashboardText: string;
}

export interface BrowserStarterSiteContentScriptLoopSmokeResult {
  extensionId: string;
  pageText: string;
  dashboardText: string;
}

interface BrowserLoadedSmokeOptions {
  chromeArgs?: string[];
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
const STARTER_SITE_HOST = 'developer.mozilla.org';

export async function validateBrowserLoadedExtension(
  outputDir: string,
  options: BrowserLoadedSmokeOptions = {},
): Promise<BrowserLoadedSmokeResult> {
  return withLoadedExtension(outputDir, options, async ({ client, extensionId, timeoutMs }) => {
    const dashboardText = await client.readPageText(`chrome-extension://${extensionId}/dashboard.html`, timeoutMs);
    const popupText = await client.readPageText(`chrome-extension://${extensionId}/popup.html`, timeoutMs);
    const sidePanelText = await client.readPageText(`chrome-extension://${extensionId}/sidepanel.html`, timeoutMs);

    return { extensionId, dashboardText, popupText, sidePanelText };
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

export async function validateBrowserStarterSiteContentScriptLoop(
  outputDir: string,
  options: BrowserLoadedSmokeOptions = {},
): Promise<BrowserStarterSiteContentScriptLoopSmokeResult> {
  return withLocalStarterSite(async (starterSiteUrl) =>
    withLoadedExtension(
      outputDir,
      {
        ...options,
        chromeArgs: [
          ...(options.chromeArgs ?? []),
          '--allow-insecure-localhost',
          '--ignore-certificate-errors',
          `--host-resolver-rules=MAP ${STARTER_SITE_HOST} 127.0.0.1`,
        ],
        timeoutMs: Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 25_000),
      },
      async ({ client, extensionId, timeoutMs }) => {
        const dashboardUrl = `chrome-extension://${extensionId}/dashboard.html`;

        return client.withOpenPage(starterSiteUrl, timeoutMs, async (sessionId) => {
          const pageText = await client.readAttachedPageText(sessionId, timeoutMs);
          const dashboardText = await waitFor(async () => {
            const text = await client.readPageText(dashboardUrl, timeoutMs);
            if (text.includes(STARTER_SITE_HOST) && !text.includes('No reading data yet')) {
              return text;
            }

            throw new Error(`Dashboard did not show starter-site reading data yet:\n${text.slice(0, 1_000)}`);
          }, timeoutMs, 1_000);

          return { extensionId, pageText, dashboardText };
        });
      },
    ),
  );
}

async function withLoadedExtension<T>(
  outputDir: string,
  {
    chromeArgs = [],
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
  const chrome = launchChrome(chromePath, userDataDir, headless, chromeArgs);
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

async function withLocalStarterSite<T>(runSmoke: (url: string) => Promise<T>): Promise<T> {
  const certificateDir = await mkdtemp(path.join(tmpdir(), 'yuel-starter-site-cert-'));
  const keyPath = path.join(certificateDir, 'key.pem');
  const certPath = path.join(certificateDir, 'cert.pem');

  await createSelfSignedStarterSiteCertificate(keyPath, certPath);
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
  const server = createServer({ cert, key }, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(createStarterSiteHtml());
  });

  try {
    const port = await listenOnLocalhost(server);
    return await runSmoke(`https://${STARTER_SITE_HOST}:${port}/en-US/docs/Yuel`);
  } finally {
    await closeServer(server);
    await rm(certificateDir, { force: true, recursive: true });
  }
}

async function createSelfSignedStarterSiteCertificate(keyPath: string, certPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        `/CN=${STARTER_SITE_HOST}`,
        '-addext',
        `subjectAltName=DNS:${STARTER_SITE_HOST}`,
      ],
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });
}

function createStarterSiteHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Starter content script reading loop</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 40px; max-width: 760px; line-height: 1.7; }
      article { min-height: 1400px; }
      p { font-size: 18px; margin: 0 0 24px; }
    </style>
  </head>
  <body>
    <main>
      <article>
        <h1>Starter content script reading loop</h1>
        <p>
          Local first browser extensions can measure careful reading behavior on documentation pages while keeping
          vocabulary exposure, architecture notes, and performance signals inside the user's browser database.
        </p>
        <p>
          This starter site page gives the packaged content script a visible article block long enough to emit
          exposure ticks, persist local reading events, and update the dashboard without manual runtime messages.
        </p>
      </article>
    </main>
  </body>
</html>`;
}

async function listenOnLocalhost(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };

    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Local starter site did not expose a TCP address');
  }

  return (address as AddressInfo).port;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
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

function launchChrome(
  chromePath: string,
  userDataDir: string,
  headless: boolean,
  extraArgs: string[],
): ChildProcessWithoutNullStreams {
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
    ...extraArgs,
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

async function waitFor<T>(operation: () => Promise<T>, timeoutMs: number, intervalMs = 100): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
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
      return this.readAttachedPageText(sessionId, timeoutMs);
    });
  }

  async readAttachedPageText(sessionId: string, timeoutMs: number): Promise<string> {
    return waitFor(async () => {
      const pageText = await this.evaluate<string>('document.body?.innerText ?? ""', sessionId);
      if (!pageText.trim()) {
        throw new Error('Page text is empty');
      }

      return pageText;
    }, timeoutMs);
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

  async withOpenPage<T>(url: string, timeoutMs: number, readPage: (sessionId: string) => Promise<T>): Promise<T> {
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

  private async withPage<T>(url: string, timeoutMs: number, readPage: (sessionId: string) => Promise<T>): Promise<T> {
    return this.withOpenPage(url, timeoutMs, readPage);
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
