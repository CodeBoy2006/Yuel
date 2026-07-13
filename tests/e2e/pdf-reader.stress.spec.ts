import type {
  CDPSession,
  Page,
} from '@playwright/test';

import {
  expect,
  openExtensionPage,
  test,
} from './helpers/extension';
import { createPdfStressFixture } from './helpers/pdf';

const MEBIBYTE = 1024 * 1024;
const STRESS_ENABLED = process.env.YUEL_PDF_READER_STRESS === '1';

interface RendererMetrics {
  documents: number;
  jsHeapUsedBytes: number;
  nodes: number;
}

test.describe('PDF reader stress', () => {
  test.skip(
    !STRESS_ENABLED,
    'Set YUEL_PDF_READER_STRESS=1 or run pnpm test:stress:pdf-reader.',
  );

  test('bounds rendering and analytics memory for a large local PDF', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120_000);

    const pageCount = readBoundedInteger(
      process.env.YUEL_PDF_STRESS_PAGES,
      160,
      20,
      1_000,
      'YUEL_PDF_STRESS_PAGES',
    );
    const linesPerPage = readBoundedInteger(
      process.env.YUEL_PDF_STRESS_LINES,
      6,
      1,
      20,
      'YUEL_PDF_STRESS_LINES',
    );
    const maxHeapDeltaBytes = readBoundedInteger(
      process.env.YUEL_PDF_STRESS_MAX_HEAP_MB,
      128,
      32,
      1_024,
      'YUEL_PDF_STRESS_MAX_HEAP_MB',
    ) * MEBIBYTE;
    const fixture = createPdfStressFixture({ linesPerPage, pageCount });
    const pdfReader = await openExtensionPage(
      context,
      extensionId,
      'pdf-reader.html',
    );
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];

    pdfReader.on('request', (request) => {
      const url = request.url();
      if (
        !url.startsWith(`chrome-extension://${extensionId}/`)
        && !url.startsWith('blob:chrome-extension://')
        && !url.startsWith('data:')
      ) {
        externalRequests.push(url);
      }
    });
    pdfReader.on('pageerror', (error) => pageErrors.push(error.message));

    const openFileButton = pdfReader.getByRole('button', { name: '打开文件' });
    await expect(openFileButton).toBeEnabled();
    await installReadingBatchProbe(pdfReader);

    const cdp = await context.newCDPSession(pdfReader);
    await cdp.send('Performance.enable');
    const baselineMetrics = await readRendererMetrics(cdp);
    const extractionStartedAt = Date.now();

    await pdfReader.locator('input[type="file"]').setInputFiles({
      name: `yuel-reader-stress-${pageCount}.pdf`,
      mimeType: 'application/pdf',
      buffer: fixture.buffer,
    });
    await expect(pdfReader.locator('.pdf-reader__document-name')).toContainText(
      `yuel-reader-stress-${pageCount}.pdf`,
    );
    await expect(pdfReader.locator('.pdf-reader__page-shell').first()).toBeVisible();
    await expect.poll(
      () => readLatestPdfWordTotal(pdfReader),
      { timeout: 90_000 },
    ).toBe(fixture.expectedWords);

    const extractionMs = Date.now() - extractionStartedAt;
    const initialMountedPages = await readMountedPageNumbers(pdfReader);
    const extractedMetrics = await readRendererMetrics(cdp);

    expect(initialMountedPages).toContain(1);
    expect(initialMountedPages.length).toBeLessThanOrEqual(4);
    const initialBasePages = await pdfReader
      .locator('.pdf-reader__base-page')
      .count();
    expect(initialBasePages).toBeLessThanOrEqual(4);

    const pageInput = pdfReader.locator(
      '.pdf-reader__document-tools .pdf-reader__page-control input',
    );
    await pageInput.fill(String(pageCount));
    await pageInput.press('Enter');
    await expect.poll(() => pageInput.inputValue()).toBe(String(pageCount));
    await expect(
      pdfReader.locator(
        `.pdf-reader__page-shell[data-page-number="${pageCount}"]`,
      ),
    ).toBeVisible();

    const finalMountedPages = await readMountedPageNumbers(pdfReader);
    const finalBasePages = await pdfReader
      .locator('.pdf-reader__base-page')
      .count();
    const finalMetrics = await readRendererMetrics(cdp);
    const peakHeapUsedBytes = Math.max(
      extractedMetrics.jsHeapUsedBytes,
      finalMetrics.jsHeapUsedBytes,
    );
    const heapDeltaBytes = Math.max(
      0,
      peakHeapUsedBytes - baselineMetrics.jsHeapUsedBytes,
    );
    const peakNodes = Math.max(extractedMetrics.nodes, finalMetrics.nodes);
    const nodeDelta = Math.max(0, peakNodes - baselineMetrics.nodes);
    const peakDocuments = Math.max(
      extractedMetrics.documents,
      finalMetrics.documents,
    );
    const documentDelta = Math.max(
      0,
      peakDocuments - baselineMetrics.documents,
    );

    expect(finalMountedPages).toContain(pageCount);
    expect(finalMountedPages).not.toContain(1);
    expect(finalMountedPages.length).toBeLessThanOrEqual(4);
    expect(finalBasePages).toBeLessThanOrEqual(4);
    expect(heapDeltaBytes).toBeLessThan(maxHeapDeltaBytes);
    expect(nodeDelta).toBeLessThan(4_000);
    expect(documentDelta).toBeLessThan(10);
    expect(externalRequests).toEqual([]);
    expect(pageErrors).toEqual([]);

    console.info([
      'large PDF reader stress',
      `pages=${fixture.pageCount}`,
      `linesPerPage=${fixture.linesPerPage}`,
      `words=${fixture.expectedWords}`,
      `pdfBytes=${fixture.buffer.byteLength}`,
      `extractionMs=${extractionMs}`,
      `initialMounted=${initialMountedPages.join(',')}`,
      `finalMounted=${finalMountedPages.join(',')}`,
      `initialBasePages=${initialBasePages}`,
      `finalBasePages=${finalBasePages}`,
      `heapBaselineMiB=${formatMebibytes(baselineMetrics.jsHeapUsedBytes)}`,
      `heapDeltaMiB=${formatMebibytes(heapDeltaBytes)}`,
      `nodeDelta=${nodeDelta}`,
      `documentDelta=${documentDelta}`,
    ].join(' | '));

    await pdfReader.waitForTimeout(1_250);
    await pdfReader.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    });
    const analyticsDashboard = await openExtensionPage(
      context,
      extensionId,
      'dashboard.html',
    );
    await analyticsDashboard.bringToFront();
    await expect.poll(async () => {
      await analyticsDashboard.reload({ waitUntil: 'load' });
      return analyticsDashboard.locator('body').innerText();
    }, { timeout: 10_000 }).toContain('pdf.local');

    await analyticsDashboard.close();
    await cdp.detach();
    await pdfReader.close();
  });
});

async function installReadingBatchProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type RuntimeApi = {
      sendMessage: (...args: unknown[]) => unknown;
    };
    const runtime = (globalThis as typeof globalThis & {
      chrome: { runtime: RuntimeApi };
    }).chrome.runtime;
    const originalSendMessage = runtime.sendMessage.bind(runtime);
    const messages: unknown[] = [];
    (globalThis as typeof globalThis & {
      __yuelPdfStressMessages?: unknown[];
    }).__yuelPdfStressMessages = messages;

    runtime.sendMessage = (...args: unknown[]) => {
      const message = args[0];
      if (
        typeof message === 'object'
        && message !== null
        && 'type' in message
        && message.type === 'yuel.readingEvents.batch'
      ) {
        messages.push(message);
      }
      return originalSendMessage(...args);
    };
  });
}

async function readLatestPdfWordTotal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const messages = (globalThis as typeof globalThis & {
      __yuelPdfStressMessages?: unknown[];
    }).__yuelPdfStressMessages ?? [];

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        typeof message !== 'object'
        || message === null
        || !('payload' in message)
        || typeof message.payload !== 'object'
        || message.payload === null
        || !('page' in message.payload)
        || typeof message.payload.page !== 'object'
        || message.payload.page === null
      ) {
        continue;
      }

      const pageSnapshot = message.payload.page;
      if (
        'resourceType' in pageSnapshot
        && pageSnapshot.resourceType === 'pdf'
        && 'totalWords' in pageSnapshot
        && typeof pageSnapshot.totalWords === 'number'
      ) {
        return pageSnapshot.totalWords;
      }
    }

    return 0;
  });
}

async function readMountedPageNumbers(page: Page): Promise<number[]> {
  return page.locator('.pdf-reader__page-shell[data-page-number]').evaluateAll(
    (elements) => elements
      .map((element) => Number(
        (element as HTMLElement).dataset.pageNumber,
      ))
      .filter((pageNumber) => Number.isSafeInteger(pageNumber))
      .sort((left, right) => left - right),
  );
}

async function readRendererMetrics(cdp: CDPSession): Promise<RendererMetrics> {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  const { metrics } = await cdp.send('Performance.getMetrics');
  const values = new Map(metrics.map(({ name, value }) => [name, value]));

  return {
    documents: values.get('Documents') ?? 0,
    jsHeapUsedBytes: values.get('JSHeapUsedSize') ?? 0,
    nodes: values.get('Nodes') ?? 0,
  };
}

function readBoundedInteger(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function formatMebibytes(bytes: number): string {
  return (bytes / MEBIBYTE).toFixed(2);
}
