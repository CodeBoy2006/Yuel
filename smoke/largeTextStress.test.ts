import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { summarizeReadingEventBatch } from '../src/storage/aggregateReading';
import type { ReadingEventBatchPayload } from '../src/messaging/contracts';
import { validateLargeBrowserDomTextStress } from './browserDomSmoke';

interface AggregationStressResult {
  chunkCount: number;
  elapsedMs: number;
  pageEffectiveWords: number;
  tickCount: number;
  visibleChunksPerTick: number;
}

const LARGE_TEXT_SCENARIO = {
  aggregationChunkCount: 160,
  aggregationTickCount: 2_000,
  aggregationVisibleChunksPerTick: 80,
  excludedParagraphCount: 150,
  paragraphCount: 1_200,
  wordsPerParagraph: 80,
};

describe('large text stress', () => {
  it(
    'extracts a large browser DOM document with native range geometry',
    async () => {
      const result = await validateLargeBrowserDomTextStress({
        excludedParagraphCount: LARGE_TEXT_SCENARIO.excludedParagraphCount,
        paragraphCount: LARGE_TEXT_SCENARIO.paragraphCount,
        wordsPerParagraph: LARGE_TEXT_SCENARIO.wordsPerParagraph,
      });

      console.info(
        [
          'large browser DOM extraction',
          `paragraphs=${result.paragraphCount}`,
          `excludedParagraphs=${result.excludedParagraphCount * 3}`,
          `blocks=${result.blockCount}`,
          `words=${result.totalWords}`,
          `htmlBytes=${result.htmlBytes}`,
          `collectMs=${result.collectMs.toFixed(2)}`,
          `rangeRectMs=${result.rangeRectMs.toFixed(2)}`,
          `rangeRects=${result.rangeRectCount}`,
        ].join(' | '),
      );

      expect(result.documentReadyState).toBe('complete');
      expect(result.pageDomain).toBe('127.0.0.1');
      expect(result.blockCount).toBe(LARGE_TEXT_SCENARIO.paragraphCount);
      expect(result.totalWords).toBeGreaterThanOrEqual(
        LARGE_TEXT_SCENARIO.paragraphCount * LARGE_TEXT_SCENARIO.wordsPerParagraph,
      );
      expect(result.firstSelector).toBe('p#stress-1');
      expect(result.lastSelector).toBe(`p#stress-${LARGE_TEXT_SCENARIO.paragraphCount}`);
      expect(result.rangeRectCount).toBeGreaterThanOrEqual(result.blockCount);
      expect(result.collectMs).toBeGreaterThan(0);
      expect(result.rangeRectMs).toBeGreaterThan(0);
    },
    60_000,
  );

  it('aggregates a large viewport exposure event batch', () => {
    const payload = createAggregationStressPayload({
      chunkCount: LARGE_TEXT_SCENARIO.aggregationChunkCount,
      tickCount: LARGE_TEXT_SCENARIO.aggregationTickCount,
      visibleChunksPerTick: LARGE_TEXT_SCENARIO.aggregationVisibleChunksPerTick,
    });
    const startedAt = performance.now();
    const summary = summarizeReadingEventBatch(payload);
    const elapsedMs = performance.now() - startedAt;
    const result: AggregationStressResult = {
      chunkCount: payload.chunks.length,
      elapsedMs,
      pageEffectiveWords: summary.pageEffectiveWords,
      tickCount: payload.events.length,
      visibleChunksPerTick: LARGE_TEXT_SCENARIO.aggregationVisibleChunksPerTick,
    };

    console.info(
      [
        'large aggregation stress',
        `ticks=${result.tickCount}`,
        `chunks=${result.chunkCount}`,
        `visibleChunksPerTick=${result.visibleChunksPerTick}`,
        `elapsedMs=${result.elapsedMs.toFixed(2)}`,
        `pageEffectiveWords=${result.pageEffectiveWords.toFixed(2)}`,
        `chunkUpdates=${summary.chunkUpdates.length}`,
        `chunkDayUpdates=${summary.chunkDayUpdates.length}`,
      ].join(' | '),
    );

    expect(summary.chunkUpdates).toHaveLength(payload.chunks.length);
    expect(summary.chunkDayUpdates).toHaveLength(payload.chunks.length);
    expect(result.pageEffectiveWords).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThan(0);
  });
});

function createAggregationStressPayload({
  chunkCount,
  tickCount,
  visibleChunksPerTick,
}: {
  chunkCount: number;
  tickCount: number;
  visibleChunksPerTick: number;
}): ReadingEventBatchPayload {
  const chunks = Array.from({ length: chunkCount }, (_, index) => ({
    chunkId: `chunk-${index + 1}`,
    pageId: 'large-page',
    textHash: `text-${index + 1}`,
    text: `Large stress paragraph ${index + 1} repeats architecture performance reading analytics vocabulary for aggregation.`,
    wordCount: 96,
    sentenceCount: 1,
    selector: `p#stress-${index + 1}`,
  }));

  return {
    page: {
      pageId: 'large-page',
      urlHash: 'large-url',
      titleHash: 'large-title',
      domain: 'large.example',
      language: 'en',
      totalWords: chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0),
      capturedAt: Date.UTC(2026, 5, 29, 12, 0, 0),
    },
    chunks,
    events: Array.from({ length: tickCount }, (_, index) => ({
      id: `large-stress-event-${index + 1}`,
      sessionId: 'large-stress-session',
      pageId: 'large-page',
      kind: 'TextViewportExposureTick' as const,
      occurredAt: Date.UTC(2026, 5, 29, 12, 0, 0) + index * 1_250,
      confidence: 'high' as const,
      value: {
        tickMs: 1_250,
        baseWordsPerMinute: 220,
        activeTab: true,
        documentVisible: true,
        scrollSpeedWordsPerMinute: 90 + (index % 5) * 20,
        idleAgeMs: index % 200 === 0 ? 55_000 : 4_000,
        visibleChunks: Array.from({ length: visibleChunksPerTick }, (_, offset) => {
          const chunkIndex = (index + offset) % chunkCount;
          return {
            chunkId: `chunk-${chunkIndex + 1}`,
            wordCount: 96,
            visibleRatio: 0.18 + (offset % 5) * 0.14,
            centerDistance: (offset % 6) / 6,
            contentWeight: offset % 9 === 0 ? 0.72 : 1,
          };
        }),
      },
    })),
  };
}
