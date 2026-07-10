import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
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

export interface RealPageCorpusPerformanceOptions extends BrowserDomSmokeOptions {
  maxConcurrency?: number;
  pageSettleMs?: number;
  urls?: string[];
}

export interface RealPageCorpusPerformanceResult {
  pages: RealPagePerformancePageResult[];
  summary: RealPageCorpusPerformanceSummary;
}

export interface RealPageCorpusPerformanceSummary {
  failedCount: number;
  maxCollectMs: number;
  medianCollectMs: number;
  pagesWithBlocks: number;
  p95CollectMs: number;
  requestedCount: number;
  succeededCount: number;
  totalBlocks: number;
  totalWords: number;
}

export type RealPagePerformancePageResult = RealPagePerformanceFailure | RealPagePerformanceSuccess;

export interface RealPagePerformanceFailure {
  elapsedMs: number;
  error: string;
  ok: false;
  requestedUrl: string;
}

export interface RealPagePerformanceSuccess {
  articleLikeElementCount: number;
  blockCount: number;
  bodyTextChars: number;
  collectMs: number;
  domain: string;
  elapsedMs: number;
  finalUrl: string;
  firstSelectors: string[];
  language: string;
  longestChunkWords: number;
  navigation?: {
    domContentLoadedMs: number;
    durationMs: number;
    loadMs: number;
  };
  ok: true;
  rangeRectCount: number;
  rangeRectMs: number;
  readyState: string;
  requestedUrl: string;
  title: string;
  totalWords: number;
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
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
export const DEFAULT_REAL_PAGE_CORPUS_URLS = [
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model',
  'https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver',
  'https://developer.mozilla.org/en-US/docs/Web/API/History/pushState',
  'https://en.wikipedia.org/wiki/JavaScript',
  'https://en.wikipedia.org/wiki/Web_browser',
  'https://en.wikipedia.org/wiki/Single-page_application',
  'https://en.wikipedia.org/wiki/Large_language_model',
  'https://docs.github.com/en/actions',
  'https://docs.github.com/en/rest',
  'https://docs.github.com/en/pull-requests',
  'https://react.dev/learn',
  'https://react.dev/reference/react',
  'https://vuejs.org/guide/introduction.html',
  'https://vuejs.org/api/application.html',
  'https://nextjs.org/docs',
  'https://nextjs.org/docs/app/getting-started/installation',
  'https://nodejs.org/api/fs.html',
  'https://www.typescriptlang.org/docs/handbook/intro.html',
  'https://web.dev/learn/performance?hl=en',
  'https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world?hl=en',
  'https://go.dev/doc/effective_go',
] as const;

export async function validateBrowserDomTextExtraction(
  options: BrowserDomSmokeOptions = {},
): Promise<BrowserDomTextExtractionResult> {
  return withSourceModuleServer(async (baseUrl) =>
    withBrowser(options, async ({ browserContext, timeoutMs }) => {
      return withOpenPage(browserContext, `${baseUrl}/browser-dom-fixture`, timeoutMs, async (page) => {
        return waitFor(async () => {
          const result = await page.evaluate<BrowserDomTextExtractionResult | null>(
            'window.__YUEL_BROWSER_DOM_RESULT__ ?? null',
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
    withBrowser({ ...browserOptions, timeoutMs }, async ({ browserContext }) => {
      const stressUrl = new URL('/large-text-stress', baseUrl);
      stressUrl.searchParams.set('excludedParagraphCount', String(excludedParagraphCount));
      stressUrl.searchParams.set('paragraphCount', String(paragraphCount));
      stressUrl.searchParams.set('wordsPerParagraph', String(wordsPerParagraph));

      return withOpenPage(browserContext, stressUrl.href, timeoutMs, async (page) => {
        return waitFor(async () => {
          const result = await page.evaluate<LargeBrowserDomTextStressResult | null>(
            'window.__YUEL_LARGE_TEXT_STRESS_RESULT__ ?? null',
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
    withBrowser(options, async ({ browserContext, timeoutMs }) => {
      return withOpenPage(browserContext, `${baseUrl}/spa-dynamic-collector`, timeoutMs, async (page) => {
        return waitFor(async () => {
          const result = await page.evaluate<BrowserSpaDynamicCollectorResult | null>(
            'window.__YUEL_SPA_DYNAMIC_RESULT__ ?? null',
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

export async function validateRealPageCorpusPerformance({
  maxConcurrency = 3,
  pageSettleMs = 1_500,
  timeoutMs = 30_000,
  urls = [...DEFAULT_REAL_PAGE_CORPUS_URLS],
  ...browserOptions
}: RealPageCorpusPerformanceOptions = {}): Promise<RealPageCorpusPerformanceResult> {
  const benchmarkExpression = await createRealPageBenchmarkExpression();
  const chromeArgs = ['--lang=en-US', ...(browserOptions.chromeArgs ?? [])];

  const pages = await withBrowser({ ...browserOptions, chromeArgs, timeoutMs }, async ({ browserContext }) => {
    return mapWithConcurrency(urls, maxConcurrency, (url) =>
      benchmarkRealPage({
        benchmarkExpression,
        browserContext,
        pageSettleMs,
        timeoutMs,
        url,
      }),
    );
  });

  return {
    pages,
    summary: summarizeRealPageCorpusPerformance(pages),
  };
}

export function formatRealPageCorpusPerformance(result: RealPageCorpusPerformanceResult): string {
  const lines = [
    [
      'real page corpus summary',
      `requested=${result.summary.requestedCount}`,
      `succeeded=${result.summary.succeededCount}`,
      `failed=${result.summary.failedCount}`,
      `pagesWithBlocks=${result.summary.pagesWithBlocks}`,
      `totalBlocks=${result.summary.totalBlocks}`,
      `totalWords=${result.summary.totalWords}`,
      `medianCollectMs=${result.summary.medianCollectMs.toFixed(2)}`,
      `p95CollectMs=${result.summary.p95CollectMs.toFixed(2)}`,
      `maxCollectMs=${result.summary.maxCollectMs.toFixed(2)}`,
    ].join(' | '),
  ];

  for (const page of result.pages) {
    if (!page.ok) {
      lines.push(`FAIL | elapsedMs=${page.elapsedMs.toFixed(0)} | url=${page.requestedUrl} | error=${page.error}`);
      continue;
    }

    lines.push(
      [
        'OK',
        `collectMs=${page.collectMs.toFixed(2)}`,
        `rangeRectMs=${page.rangeRectMs.toFixed(2)}`,
        `blocks=${page.blockCount}`,
        `words=${page.totalWords}`,
        `rangeRects=${page.rangeRectCount}`,
        `loadMs=${page.navigation?.loadMs.toFixed(0) ?? 'n/a'}`,
        `domain=${page.domain}`,
        `url=${page.finalUrl}`,
      ].join(' | '),
    );
  }

  return lines.join('\n');
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
      return Promise.resolve({ ok: true });
    },
  },
};`;
}

async function createRealPageBenchmarkExpression(): Promise<string> {
  // The injected benchmark is self-contained because public pages cannot
  // import the extension's local source graph. Keep direct runtime dependency
  // sources explicit so new imports fail here instead of inside a page.
  const [englishSource, eventsSource, metricsSource, extractBlocksSource] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, 'src/analysis/english.ts'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'src/domain/events.ts'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'src/domain/metrics.ts'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'src/content/extractBlocks.ts'), 'utf8'),
  ]);
  const source = [
    stripModuleSyntax(englishSource),
    stripModuleSyntax(eventsSource),
    stripModuleSyntax(metricsSource),
    stripModuleSyntax(extractBlocksSource),
    `
function runYuelRealPageBenchmark() {
  const collectStartedAt = performance.now();
  const blocks = collectTextBlocks(document);
  const collectMs = performance.now() - collectStartedAt;
  const rangeStartedAt = performance.now();
  let rangeRectCount = 0;
  for (const block of blocks) {
    rangeRectCount += block.textRange?.getClientRects?.().length ?? 0;
  }
  const rangeRectMs = performance.now() - rangeStartedAt;
  const page = summarizeCurrentPage(document, blocks);
  const navigation = performance.getEntriesByType('navigation')[0];

  return {
    articleLikeElementCount: document.querySelectorAll('article, main, [role="main"], .markdown-body').length,
    blockCount: blocks.length,
    bodyTextChars: document.body?.innerText?.length ?? 0,
    collectMs,
    domain: page.domain,
    finalUrl: window.location.href,
    firstSelectors: blocks.slice(0, 5).map((block) => block.selector),
    language: page.language,
    longestChunkWords: blocks.reduce((max, block) => Math.max(max, block.wordCount), 0),
    navigation: navigation
      ? {
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          durationMs: navigation.duration,
          loadMs: navigation.loadEventEnd,
        }
      : undefined,
    rangeRectCount,
    rangeRectMs,
    readyState: document.readyState,
    title: document.title.slice(0, 160),
    totalWords: page.totalWords,
  };
}

return runYuelRealPageBenchmark();
`,
  ].join('\n');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return `(() => {\n${output.outputText}\n})()`;
}

function stripModuleSyntax(source: string): string {
  return source.replace(/^import\s+[^;]+;\s*/gm, '').replace(/^export\s+/gm, '');
}

async function benchmarkRealPage({
  benchmarkExpression,
  browserContext,
  pageSettleMs,
  timeoutMs,
  url,
}: {
  benchmarkExpression: string;
  browserContext: BrowserContext;
  pageSettleMs: number;
  timeoutMs: number;
  url: string;
}): Promise<RealPagePerformancePageResult> {
  const startedAt = Date.now();

  try {
    const result = await withOpenPage(
      browserContext,
      url,
      timeoutMs,
      async (page) => {
        if (pageSettleMs > 0) {
          await page.waitForTimeout(pageSettleMs);
        }

        const result = await page.evaluate<Omit<RealPagePerformanceSuccess, 'elapsedMs' | 'ok' | 'requestedUrl'>>(
          benchmarkExpression,
        );
        if (!result || typeof result.collectMs !== 'number') {
          throw new Error('Real page benchmark did not return performance metrics');
        }

        return result;
      },
      { readiness: 'interactive' },
    );

    return {
      ...result,
      elapsedMs: Date.now() - startedAt,
      ok: true,
      requestedUrl: url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      elapsedMs: Date.now() - startedAt,
      error: message.replace(/\s+/g, ' ').slice(0, 300),
      ok: false,
      requestedUrl: url,
    };
  }
}

async function mapWithConcurrency<Input, Output>(
  values: Input[],
  concurrency: number,
  mapper: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = [];
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(values[currentIndex]);
      }
    }),
  );

  return results;
}

function summarizeRealPageCorpusPerformance(pages: RealPagePerformancePageResult[]): RealPageCorpusPerformanceSummary {
  const successes = pages.filter((page): page is RealPagePerformanceSuccess => page.ok);
  const collectTimes = successes.map((page) => page.collectMs).sort((left, right) => left - right);

  return {
    failedCount: pages.length - successes.length,
    maxCollectMs: collectTimes.at(-1) ?? 0,
    medianCollectMs: percentile(collectTimes, 0.5),
    pagesWithBlocks: successes.filter((page) => page.blockCount > 0).length,
    p95CollectMs: percentile(collectTimes, 0.95),
    requestedCount: pages.length,
    succeededCount: successes.length,
    totalBlocks: successes.reduce((sum, page) => sum + page.blockCount, 0),
    totalWords: successes.reduce((sum, page) => sum + page.totalWords, 0),
  };
}

function percentile(sortedValues: number[], percentileRank: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileRank) - 1);
  return sortedValues[index];
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
    chromePath = process.env.CHROME_PATH,
    headless = process.env.YUEL_BROWSER_DOM_HEADLESS !== 'false',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: BrowserDomSmokeOptions,
  runSmoke: (context: { browserContext: BrowserContext; timeoutMs: number }) => Promise<T>,
): Promise<T> {
  const browser = await chromium.launch({
    args: chromeArgs,
    channel: chromePath ? undefined : 'chromium',
    executablePath: chromePath,
    headless,
  });

  try {
    const browserContext = await browser.newContext({ locale: 'en-US' });

    try {
      return await runSmoke({ browserContext, timeoutMs });
    } finally {
      await browserContext.close();
    }
  } finally {
    await browser.close();
  }
}

async function withOpenPage<T>(
  browserContext: BrowserContext,
  url: string,
  timeoutMs: number,
  readPage: (page: Page) => Promise<T>,
  { readiness = 'complete' }: { readiness?: 'complete' | 'interactive' } = {},
): Promise<T> {
  const page = await browserContext.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  try {
    return await withTimeout(
      (async () => {
        await page.goto(url, {
          timeout: timeoutMs,
          waitUntil: readiness === 'complete' ? 'load' : 'domcontentloaded',
        });
        return readPage(page);
      })(),
      timeoutMs,
      `Timed out after ${timeoutMs}ms while testing ${url}`,
    );
  } finally {
    if (!page.isClosed()) {
      await page.close();
    }
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), Math.max(1, timeoutMs));
  });

  try {
    return await Promise.race([operation, timeoutResult]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
