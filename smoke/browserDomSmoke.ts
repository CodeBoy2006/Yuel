import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import ts from 'typescript';

export interface BrowserDomTextExtractionResult {
  documentReadyState: string;
  firstBlockRect: RectSnapshot;
  firstRangeRect: RectSnapshot;
  pageDomain: string;
  selectors: string[];
  texts: string[];
}

export interface LargeBrowserDomTextStressOptions extends BrowserDomSmokeOptions {
  excludedParagraphCount?: number;
  paragraphCount?: number;
  timeoutMs?: number;
  wordsPerParagraph?: number;
}

export interface LargeBrowserDomTextStressResult {
  blockCount: number;
  collectMs: number;
  documentReadyState: string;
  excludedParagraphCount: number;
  firstSelector: string | undefined;
  htmlBytes: number;
  lastSelector: string | undefined;
  pageDomain: string;
  paragraphCount: number;
  rangeRectCount: number;
  rangeRectMs: number;
  totalWords: number;
  wordsPerParagraph: number;
}

export interface BrowserSpaDynamicCollectorResult {
  eventKinds: string[];
  finalHref: string;
  messageCount: number;
  pageIds: string[];
  selectors: string[];
}

interface BrowserDomSmokeOptions {
  chromeArgs?: string[];
  chromePath?: string;
  headless?: boolean;
  timeoutMs?: number;
}

interface RectSnapshot {
  height: number;
  width: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAC_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

export async function validateBrowserDomTextExtraction(
  options: BrowserDomSmokeOptions = {},
): Promise<BrowserDomTextExtractionResult> {
  return withSourceModuleServer(async (baseUrl) =>
    withBrowser(options, async ({ client, timeoutMs }) => {
      return client.withOpenPage(`${baseUrl}/browser-dom-fixture`, timeoutMs, async (sessionId) => {
        return waitFor(async () => {
          const result = await client.evaluate<BrowserDomTextExtractionResult | null>(
            'window.__YUEL_BROWSER_DOM_RESULT__ ?? null',
            sessionId,
          );
          if (!result) {
            throw new Error('Browser DOM fixture has not produced a result yet');
          }

          return result;
        }, timeoutMs);
      });
    }),
  );
}

export async function validateLargeBrowserDomTextStress({
  excludedParagraphCount = 150,
  paragraphCount = 1_200,
  timeoutMs = 45_000,
  wordsPerParagraph = 80,
  ...browserOptions
}: LargeBrowserDomTextStressOptions = {}): Promise<LargeBrowserDomTextStressResult> {
  return withSourceModuleServer(async (baseUrl) =>
    withBrowser({ ...browserOptions, timeoutMs }, async ({ client }) => {
      const stressUrl = new URL('/large-text-stress', baseUrl);
      stressUrl.searchParams.set('excludedParagraphCount', String(excludedParagraphCount));
      stressUrl.searchParams.set('paragraphCount', String(paragraphCount));
      stressUrl.searchParams.set('wordsPerParagraph', String(wordsPerParagraph));

      return client.withOpenPage(stressUrl.href, timeoutMs, async (sessionId) => {
        return waitFor(async () => {
          const result = await client.evaluate<LargeBrowserDomTextStressResult | null>(
            'window.__YUEL_LARGE_TEXT_STRESS_RESULT__ ?? null',
            sessionId,
          );
          if (!result) {
            throw new Error('Large text stress fixture has not produced a result yet');
          }

          return result;
        }, timeoutMs);
      });
    }),
  );
}

export async function validateBrowserSpaDynamicCollector(
  options: BrowserDomSmokeOptions = {},
): Promise<BrowserSpaDynamicCollectorResult> {
  return withSourceModuleServer(async (baseUrl) =>
    withBrowser(options, async ({ client, timeoutMs }) => {
      return client.withOpenPage(`${baseUrl}/spa-dynamic-collector`, timeoutMs, async (sessionId) => {
        return waitFor(async () => {
          const result = await client.evaluate<BrowserSpaDynamicCollectorResult | null>(
            'window.__YUEL_SPA_DYNAMIC_RESULT__ ?? null',
            sessionId,
          );
          if (!result) {
            throw new Error('SPA dynamic collector fixture has not produced a result yet');
          }

          return result;
        }, timeoutMs);
      });
    }),
  );
}

async function withSourceModuleServer<T>(runSmoke: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(handleSourceModuleRequest);

  try {
    const port = await listenOnLocalhost(server);
    return await runSmoke(`http://127.0.0.1:${port}`);
  } finally {
    await closeServer(server);
  }
}

async function handleSourceModuleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/browser-dom-fixture') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(createBrowserDomFixtureHtml());
      return;
    }

    if (requestUrl.pathname === '/large-text-stress') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        createLargeTextStressHtml({
          excludedParagraphCount: readIntegerParam(requestUrl, 'excludedParagraphCount', 150),
          paragraphCount: readIntegerParam(requestUrl, 'paragraphCount', 1_200),
          wordsPerParagraph: readIntegerParam(requestUrl, 'wordsPerParagraph', 80),
        }),
      );
      return;
    }

    if (requestUrl.pathname === '/spa-dynamic-collector') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(createSpaDynamicCollectorHtml());
      return;
    }

    if (requestUrl.pathname === '/__wxt-browser-stub.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(createWxtBrowserStubModule());
      return;
    }

    if (requestUrl.pathname.startsWith('/src/')) {
      const sourcePath = resolveSourcePath(requestUrl.pathname);
      const source = await readFile(sourcePath, 'utf8');
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(transpileTypeScriptModule(source, sourcePath));
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.stack : String(error));
  }
}

function resolveSourcePath(urlPathname: string): string {
  const relativePath = urlPathname.replace(/^\/+/, '');
  const candidates = [
    path.join(PROJECT_ROOT, relativePath),
    path.join(PROJECT_ROOT, `${relativePath}.ts`),
    path.join(PROJECT_ROOT, `${relativePath}.tsx`),
  ];
  const sourcePath = candidates.find(
    (candidate) => path.resolve(candidate).startsWith(`${PROJECT_ROOT}${path.sep}`) && existsSync(candidate),
  );
  if (!sourcePath) {
    throw new Error(`Source module path escapes the project root: ${urlPathname}`);
  }

  return sourcePath;
}

function transpileTypeScriptModule(source: string, sourcePath: string): string {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });

  return `${output.outputText}\n//# sourceURL=${sourcePath}`;
}

function readIntegerParam(requestUrl: URL, name: string, fallback: number): number {
  const value = Number(requestUrl.searchParams.get(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function createBrowserDomFixtureHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Yuel browser DOM fixture</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 32px; max-width: 760px; line-height: 1.7; }
      nav p { display: block; }
      article p { font-size: 18px; margin: 0 0 20px; }
      #hidden { display: none; }
    </style>
  </head>
  <body>
    <nav>
      <p id="nav-copy">Navigation text should stay outside measured reading content for local browser analytics.</p>
    </nav>
    <main>
      <article>
        <p id="visible">
          Budgeted reading analytics depend on browser layout APIs so visible article text can become stable local
          reading blocks without mocked geometry.
        </p>
        <p id="hidden">
          Hidden implementation notes should not be captured because real browser layout reports no rendered box.
        </p>
        <p id="second">
          Real DOM tests protect the text range mapping used by viewport exposure and reading progress collection.
        </p>
      </article>
    </main>
    <script type="module">
      import { collectTextBlocks, summarizeCurrentPage } from '/src/content/extractBlocks.ts';

      const publishResult = () => {
        const blocks = collectTextBlocks(document);
        const page = summarizeCurrentPage(document, blocks);
        const firstBlockRect = blocks[0]?.element.getBoundingClientRect();
        const firstRangeRect = blocks[0]?.textRange?.getClientRects()?.[0];

        window.__YUEL_BROWSER_DOM_RESULT__ = {
          documentReadyState: document.readyState,
          firstBlockRect: {
            height: firstBlockRect?.height ?? 0,
            width: firstBlockRect?.width ?? 0,
          },
          firstRangeRect: {
            height: firstRangeRect?.height ?? 0,
            width: firstRangeRect?.width ?? 0,
          },
          pageDomain: page.domain,
          selectors: blocks.map((block) => block.selector),
          texts: blocks.map((block) => block.text),
        };
      };

      if (document.readyState === 'complete') {
        publishResult();
      } else {
        window.addEventListener('load', publishResult, { once: true });
      }
    </script>
  </body>
</html>`;
}

function createSpaDynamicCollectorHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Yuel SPA dynamic collector fixture</title>
    <script type="importmap">
      {
        "imports": {
          "wxt/browser": "/__wxt-browser-stub.js"
        }
      }
    </script>
    <style>
      body { font-family: system-ui, sans-serif; margin: 32px; max-width: 760px; line-height: 1.7; }
      article p { font-size: 18px; margin: 0 0 20px; }
    </style>
  </head>
  <body>
    <main>
      <article id="app">
        <p id="initial-route">Initial SPA route content should start reading collection before dynamic updates.</p>
      </article>
    </main>
    <script type="module">
      import { startReadingCollector } from '/src/content/collector.ts';

      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const publishResult = () => {
        const messages = window.__YUEL_SENT_MESSAGES__ ?? [];
        window.__YUEL_SPA_DYNAMIC_RESULT__ = {
          eventKinds: messages.flatMap((message) => message.payload.events.map((event) => event.kind)),
          finalHref: window.location.href,
          messageCount: messages.length,
          pageIds: messages.map((message) => message.payload.page.pageId),
          selectors: [...new Set(messages.flatMap((message) => message.payload.chunks.map((chunk) => chunk.selector)))],
        };
      };

      const run = async () => {
        const controller = startReadingCollector({
          dynamicRefreshDebounceMs: 50,
          flushIntervalMs: 250,
          idleTimeoutMs: 10_000,
          routeCheckIntervalMs: 50,
        });
        await wait(100);

        const injected = document.createElement('p');
        injected.id = 'injected-route';
        injected.textContent =
          'Injected infinite scroll route content should be collected after the SPA appends readable DOM nodes.';
        document.querySelector('#app')?.append(injected);
        await wait(120);

        window.history.pushState({}, '', '/next-spa-route');
        document.body.innerHTML = \`
          <main>
            <article id="app">
              <p id="next-route">Next SPA route content should create a replacement page snapshot after navigation.</p>
            </article>
          </main>
        \`;
        await wait(150);
        controller.stop();
        await wait(50);
        publishResult();
      };

      if (document.readyState === 'complete') {
        void run();
      } else {
        window.addEventListener('load', () => void run(), { once: true });
      }
    </script>
  </body>
</html>`;
}

function createWxtBrowserStubModule(): string {
  return `window.__YUEL_SENT_MESSAGES__ = window.__YUEL_SENT_MESSAGES__ ?? [];
export const browser = {
  runtime: {
    sendMessage(message) {
      window.__YUEL_SENT_MESSAGES__.push(message);
      return Promise.resolve();
    },
  },
};`;
}

function createLargeTextStressHtml({
  excludedParagraphCount,
  paragraphCount,
  wordsPerParagraph,
}: {
  excludedParagraphCount: number;
  paragraphCount: number;
  wordsPerParagraph: number;
}): string {
  const articleParagraphs = Array.from({ length: paragraphCount }, (_, index) =>
    `<p id="stress-${index + 1}">${escapeHtml(createStressParagraph(index + 1, wordsPerParagraph))}</p>`,
  ).join('\n');
  const createExcludedParagraphs = (prefix: string) =>
    Array.from(
      { length: excludedParagraphCount },
      (_, index) =>
        `<p id="${prefix}-${index + 1}">${escapeHtml(
          createStressParagraph(index + 1, Math.max(16, Math.floor(wordsPerParagraph / 2))),
        )}</p>`,
    ).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Yuel large text stress fixture</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 32px; max-width: 820px; line-height: 1.65; }
      article p { font-size: 17px; margin: 0 0 18px; }
      nav, footer, [aria-hidden="true"] { display: block; }
      .hidden-region { display: none; }
    </style>
  </head>
  <body>
    <nav>${createExcludedParagraphs('nav-excluded')}</nav>
    <main>
      <article>${articleParagraphs}</article>
    </main>
    <footer>${createExcludedParagraphs('footer-excluded')}</footer>
    <section class="hidden-region" aria-hidden="true">${createExcludedParagraphs('hidden-excluded')}</section>
    <script type="module">
      import { collectTextBlocks, summarizeCurrentPage } from '/src/content/extractBlocks.ts';

      const publishResult = () => {
        const collectStartedAt = performance.now();
        const blocks = collectTextBlocks(document);
        const collectMs = performance.now() - collectStartedAt;
        const page = summarizeCurrentPage(document, blocks);
        const rangeStartedAt = performance.now();
        let rangeRectCount = 0;
        for (const block of blocks) {
          rangeRectCount += block.textRange?.getClientRects()?.length ?? 0;
        }
        const rangeRectMs = performance.now() - rangeStartedAt;

        window.__YUEL_LARGE_TEXT_STRESS_RESULT__ = {
          blockCount: blocks.length,
          collectMs,
          documentReadyState: document.readyState,
          excludedParagraphCount: ${JSON.stringify(excludedParagraphCount)},
          firstSelector: blocks[0]?.selector,
          htmlBytes: document.documentElement.outerHTML.length,
          lastSelector: blocks.at(-1)?.selector,
          pageDomain: page.domain,
          paragraphCount: ${JSON.stringify(paragraphCount)},
          rangeRectCount,
          rangeRectMs,
          totalWords: page.totalWords,
          wordsPerParagraph: ${JSON.stringify(wordsPerParagraph)},
        };
      };

      if (document.readyState === 'complete') {
        publishResult();
      } else {
        window.addEventListener('load', publishResult, { once: true });
      }
    </script>
  </body>
</html>`;
}

function createStressParagraph(index: number, targetWords: number): string {
  const seedWords = [
    'architecture',
    'performance',
    'reading',
    'analytics',
    'viewport',
    'exposure',
    'budget',
    'collector',
    'extension',
    'browser',
    'storage',
    'vocabulary',
    'documentation',
    'range',
    'geometry',
    'local',
  ];
  const words = Array.from({ length: targetWords }, (_, wordIndex) => {
    if (wordIndex === 0) return `Section${index}`;
    return seedWords[(index + wordIndex) % seedWords.length];
  });

  return `${words.join(' ')}.`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function withBrowser<T>(
  {
    chromeArgs = [],
    chromePath = process.env.CHROME_PATH ?? MAC_CHROME_PATH,
    headless = process.env.YUEL_BROWSER_DOM_HEADLESS !== 'false',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: BrowserDomSmokeOptions,
  runSmoke: (context: { client: CdpClient; timeoutMs: number }) => Promise<T>,
): Promise<T> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'yuel-browser-dom-'));
  const chrome = launchChrome(chromePath, userDataDir, headless, chromeArgs);
  const chromeLogs = collectProcessLogs(chrome);

  try {
    const browserWsUrl = await waitForBrowserWebSocketUrl(userDataDir, timeoutMs);
    const client = await CdpClient.connect(browserWsUrl);

    try {
      return await runSmoke({ client, timeoutMs });
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
    throw new Error('Browser DOM fixture server did not expose a TCP address');
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

  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for browser DOM smoke condition');
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

  async evaluate<T>(
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

  private async waitForPageReady(sessionId: string, timeoutMs: number): Promise<void> {
    await waitFor(async () => {
      const readyState = await this.evaluate<string>('document.readyState', sessionId);
      if (readyState !== 'complete') {
        throw new Error(`Page is not ready: ${readyState}`);
      }
    }, timeoutMs);
  }
}
