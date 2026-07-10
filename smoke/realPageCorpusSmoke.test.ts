import { writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { formatRealPageCorpusPerformance, validateRealPageCorpusPerformance } from './browserDomSmoke';

const describeRealPageCorpus = process.env.YUEL_REAL_PAGE_CORPUS === '1' ? describe : describe.skip;

describeRealPageCorpus('real page corpus performance', () => {
  it(
    'benchmarks text extraction across a live public-page corpus',
    async () => {
      const result = await validateRealPageCorpusPerformance({
        maxConcurrency: readPositiveIntegerEnv('YUEL_REAL_PAGE_CONCURRENCY', 3),
        pageSettleMs: readPositiveIntegerEnv('YUEL_REAL_PAGE_SETTLE_MS', 1_500),
        timeoutMs: readPositiveIntegerEnv('YUEL_REAL_PAGE_TIMEOUT_MS', 30_000),
      });

      const report = formatRealPageCorpusPerformance(result);
      console.info(`\n${report}`);
      if (process.env.YUEL_REAL_PAGE_REPORT_PATH) {
        await writeFile(process.env.YUEL_REAL_PAGE_REPORT_PATH, `${report}\n`, 'utf8');
      }

      expect(result.summary.requestedCount).toBeGreaterThanOrEqual(20);
      expect(result.summary.succeededCount).toBeGreaterThanOrEqual(Math.ceil(result.summary.requestedCount * 0.7));
      expect(result.summary.pagesWithBlocks).toBeGreaterThanOrEqual(Math.ceil(result.summary.requestedCount * 0.55));
      expect(result.summary.medianCollectMs).toBeLessThan(750);
      expect(result.summary.p95CollectMs).toBeLessThan(5_000);

      const chromeDocsPage = result.pages.find((page) =>
        page.requestedUrl.startsWith('https://developer.chrome.com/docs/extensions/get-started'),
      );
      expect(chromeDocsPage?.ok).toBe(true);
      if (chromeDocsPage?.ok) {
        expect(chromeDocsPage.language).toBe('en');
        expect(chromeDocsPage.blockCount).toBeGreaterThan(0);
      }
    },
    300_000,
  );
});

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
