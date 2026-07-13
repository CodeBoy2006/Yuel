import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeEnglishText } from '../analysis/english';
import {
  createChunkId,
  hashText,
  type PageSnapshot,
  type TextChunkSnapshot,
} from '../domain/events';
import { isReadingEventBatchMessage, MESSAGE_TYPES } from '../messaging/contracts';
import type { ReadingEventBatchDelivery } from '../messaging/readingEventsClient';
import { startReadingSession } from './readingSession';

function createPdfSource(): { page: PageSnapshot; chunks: TextChunkSnapshot[] } {
  const resourceId = 'pdf_local_contract-test';
  const pageId = `pdf.local_${hashText(resourceId)}`;
  const text =
    'Stable PDF reading metrics preserve visible text exposure across independent reader sessions.';
  const analysis = analyzeEnglishText(text);
  const sourceKey = 'pdf-page(1)::segment(1)';
  const chunk: TextChunkSnapshot = {
    chunkId: createChunkId(pageId, text, sourceKey),
    pageId,
    sectionId: `${resourceId}_section_1`,
    textHash: hashText(text),
    text,
    sourceKey,
    wordCount: analysis.wordCount,
    sentenceCount: analysis.sentenceCount,
    selector: sourceKey,
  };

  return {
    page: {
      pageId,
      domain: 'pdf.local',
      resourceType: 'pdf',
      resourceId,
      titleHash: hashText('Contract test PDF'),
      urlHash: hashText(resourceId),
      language: 'en',
      totalWords: chunk.wordCount,
      metricModelVersion: 2,
      capturedAt: Date.now(),
    },
    chunks: [chunk],
  };
}

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('startReadingSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 6, 14, 2, 0, 0));
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('omits document chunks from page-only PDF batches', async () => {
    const source = createPdfSource();
    const deliverBatch = vi.fn<ReadingEventBatchDelivery>(async () => true);
    const controller = startReadingSession({
      ...source,
      batchChunkStrategy: 'referenced',
      deliverBatch,
      getChunkMeasurement: () => undefined,
    });

    try {
      await flushPromises();

      expect(deliverBatch).toHaveBeenCalledOnce();
      const payload = deliverBatch.mock.calls[0][0];
      expect(payload.chunks).toEqual([]);
      expect(payload.events.map((event) => event.kind)).toEqual(['PageVisible']);
      expect(isReadingEventBatchMessage({
        type: MESSAGE_TYPES.readingEventsBatch,
        payload,
      })).toBe(true);
    } finally {
      controller.stop({ emitPageHidden: false });
      await flushPromises();
    }
  });

  it('includes only chunks referenced by PDF visibility events and exposure ticks', async () => {
    const source = createPdfSource();
    const secondText =
      'Independent PDF sections remain absent until their metrics reference them.';
    const secondAnalysis = analyzeEnglishText(secondText);
    const secondSourceKey = 'pdf-page(2)::segment(1)';
    const secondChunk: TextChunkSnapshot = {
      chunkId: createChunkId(source.page.pageId, secondText, secondSourceKey),
      pageId: source.page.pageId,
      sectionId: `${source.page.resourceId}_section_2`,
      textHash: hashText(secondText),
      text: secondText,
      sourceKey: secondSourceKey,
      wordCount: secondAnalysis.wordCount,
      sentenceCount: secondAnalysis.sentenceCount,
      selector: secondSourceKey,
    };
    const chunks = [...source.chunks, secondChunk];
    const deliverBatch = vi.fn<ReadingEventBatchDelivery>(async () => true);
    const controller = startReadingSession({
      page: {
        ...source.page,
        totalWords: chunks.reduce((total, chunk) => total + chunk.wordCount, 0),
      },
      chunks,
      batchChunkStrategy: 'referenced',
      deliverBatch,
      getChunkMeasurement: (chunkId) => chunkId === source.chunks[0].chunkId
        ? {
            visibleRatio: 1,
            visibleWordCount: source.chunks[0].wordCount,
            centerDistance: 0,
            viewportY: 0.5,
            attentionMass: source.chunks[0].wordCount,
            contentMultiplier: 1,
          }
        : undefined,
    });

    try {
      await flushPromises();
      deliverBatch.mockClear();

      controller.setChunkVisibilities([{
        chunkId: source.chunks[0].chunkId,
        visible: true,
        visibleRatio: 1,
      }]);
      await vi.advanceTimersByTimeAsync(500);
      await controller.flush();

      expect(deliverBatch).toHaveBeenCalledOnce();
      const payload = deliverBatch.mock.calls[0][0];
      expect(payload.chunks.map((chunk) => chunk.chunkId)).toEqual([
        source.chunks[0].chunkId,
      ]);
      expect(payload.events.map((event) => event.kind)).toEqual([
        'TextBlockVisible',
        'TextViewportExposureTick',
      ]);
      expect(isReadingEventBatchMessage({
        type: MESSAGE_TYPES.readingEventsBatch,
        payload,
      })).toBe(true);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('preserves source metadata while ordering exposure before visibility transitions', async () => {
    const source = createPdfSource();
    const deliverBatch = vi.fn<ReadingEventBatchDelivery>(async () => true);
    const controller = startReadingSession({
      ...source,
      deliverBatch,
      getChunkMeasurement: () => ({
        visibleRatio: 1,
        visibleWordCount: source.chunks[0].wordCount,
        centerDistance: 0,
        viewportY: 0.5,
        attentionMass: source.chunks[0].wordCount,
        contentMultiplier: 1,
      }),
    });

    try {
      await flushPromises();
      deliverBatch.mockClear();

      controller.setChunkVisibilities([{
        chunkId: source.chunks[0].chunkId,
        visible: true,
        visibleRatio: 1,
      }]);
      await vi.advanceTimersByTimeAsync(500);
      controller.setChunkVisibilities([{
        chunkId: source.chunks[0].chunkId,
        visible: false,
        visibleRatio: 0.1,
      }]);
      await controller.flush();

      expect(deliverBatch).toHaveBeenCalledOnce();
      const payload = deliverBatch.mock.calls[0][0];
      expect(payload.page).toEqual(expect.objectContaining({
        resourceType: 'pdf',
        resourceId: source.page.resourceId,
      }));
      expect(payload.chunks[0]).toEqual(expect.objectContaining({
        sectionId: source.chunks[0].sectionId,
      }));
      expect(payload.events.map((event) => event.kind)).toEqual([
        'TextBlockVisible',
        'TextViewportExposureTick',
        'TextBlockHidden',
      ]);
      expect(payload.events[1]).toEqual(expect.objectContaining({
        value: expect.objectContaining({ tickMs: 500 }),
      }));
      expect(isReadingEventBatchMessage({
        type: MESSAGE_TYPES.readingEventsBatch,
        payload,
      })).toBe(true);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('restores visible chunks after PageVisible when a hidden document returns', async () => {
    setDocumentVisibility('hidden');
    const source = createPdfSource();
    const deliverBatch = vi.fn<ReadingEventBatchDelivery>(async () => true);
    const controller = startReadingSession({
      ...source,
      deliverBatch,
      getChunkMeasurement: () => ({
        visibleRatio: 0.75,
        visibleWordCount: source.chunks[0].wordCount * 0.75,
        centerDistance: 0.1,
        viewportY: 0.4,
        attentionMass: 5,
        contentMultiplier: 1,
      }),
      getRestorableChunkVisibilities: () => [{
        chunkId: source.chunks[0].chunkId,
        visible: true,
        visibleRatio: 0.75,
      }],
    });

    try {
      await flushPromises();
      expect(deliverBatch).not.toHaveBeenCalled();

      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(500);
      await controller.flush();

      expect(deliverBatch.mock.calls[0][0].events.map((event) => event.kind)).toEqual([
        'PageVisible',
        'TextBlockVisible',
        'TextViewportExposureTick',
      ]);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('records source scroll metrics without depending on window scroll state', async () => {
    const source = createPdfSource();
    const deliverBatch = vi.fn<ReadingEventBatchDelivery>(async () => true);
    let offsetPx = 0;
    const controller = startReadingSession({
      ...source,
      deliverBatch,
      getChunkMeasurement: () => ({
        visibleRatio: 1,
        visibleWordCount: source.chunks[0].wordCount,
        centerDistance: 0,
        viewportY: 0.5,
        attentionMass: source.chunks[0].wordCount,
        contentMultiplier: 1,
      }),
      getScrollMetrics: () => ({
        offsetPx,
        scrollableExtentPx: 1_000,
      }),
      flushIntervalMs: 5_000,
      sampleIntervalMs: 1_000,
    });

    try {
      await flushPromises();
      deliverBatch.mockClear();
      controller.setChunkVisibilities([{
        chunkId: source.chunks[0].chunkId,
        visible: true,
        visibleRatio: 1,
      }]);

      await vi.advanceTimersByTimeAsync(500);
      offsetPx = 100;
      controller.recordScroll();
      await vi.advanceTimersByTimeAsync(500);
      await controller.flush();

      const events = deliverBatch.mock.calls[0][0].events;
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'ScrollVelocityChanged',
          value: expect.objectContaining({
            scrollDeltaPx: 100,
            elapsedMs: 500,
            scrollDirection: 1,
          }),
        }),
        expect.objectContaining({
          kind: 'TextViewportExposureTick',
          value: expect.objectContaining({
            scrollDirection: 1,
            scrollSpeedWordsPerMinute: expect.any(Number),
          }),
        }),
      ]));
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('hashes selected text without retaining its raw contents', async () => {
    const source = createPdfSource();
    const deliverBatch = vi.fn<ReadingEventBatchDelivery>(async () => true);
    const controller = startReadingSession({
      ...source,
      deliverBatch,
      getChunkMeasurement: () => undefined,
    });

    try {
      await flushPromises();
      deliverBatch.mockClear();
      controller.recordSelection('  selected PDF text  ');
      await controller.flush();

      const selection = deliverBatch.mock.calls[0][0].events[0];
      expect(selection).toEqual(expect.objectContaining({
        kind: 'TextSelected',
        value: {
          textHash: hashText('selected PDF text'),
          characterCount: 'selected PDF text'.length,
        },
      }));
      expect(selection.value).not.toHaveProperty('text');
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('serializes overlapping flushes and retries failed events before newer events', async () => {
    const source = createPdfSource();
    let resolveDelayedDelivery!: (delivered: boolean) => void;
    const deliverBatch = vi.fn<ReadingEventBatchDelivery>()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
        resolveDelayedDelivery = resolve;
      }))
      .mockResolvedValueOnce(true);
    const controller = startReadingSession({
      ...source,
      deliverBatch,
      getChunkMeasurement: () => undefined,
    });

    try {
      await flushPromises();
      controller.setChunkVisibilities([{
        chunkId: source.chunks[0].chunkId,
        visible: true,
        visibleRatio: 1,
      }]);
      const failedFlush = controller.flush();
      controller.recordSelection('later selection');
      const queuedFlush = controller.flush();

      expect(deliverBatch).toHaveBeenCalledTimes(2);
      resolveDelayedDelivery(false);
      expect(await failedFlush).toBe(false);
      expect(await queuedFlush).toBe(true);

      const retriedEvents = deliverBatch.mock.calls[2][0].events;
      expect(retriedEvents.map((event) => event.kind)).toEqual([
        'TextBlockVisible',
        'TextSelected',
      ]);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('rejects inconsistent page and chunk word totals before starting timers', () => {
    const source = createPdfSource();

    expect(() => startReadingSession({
      ...source,
      page: {
        ...source.page,
        totalWords: source.page.totalWords + 1,
      },
      deliverBatch: async () => true,
      getChunkMeasurement: () => undefined,
    })).toThrow(/does not match chunk total/);
  });

  it('rejects referenced batches for non-PDF reading sources', () => {
    const source = createPdfSource();

    expect(() => startReadingSession({
      ...source,
      page: {
        ...source.page,
        resourceType: 'web',
      },
      batchChunkStrategy: 'referenced',
      deliverBatch: async () => true,
      getChunkMeasurement: () => undefined,
    })).toThrow(/only supported for PDF/);
  });
});
