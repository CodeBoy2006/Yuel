import { describe, expect, it } from 'vitest';

import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { summarizeReadingEventBatch } from './aggregateReading';

const capturedAt = Date.UTC(2026, 5, 27, 12, 0, 0);

function createPayload(overrides: Partial<ReadingEventBatchPayload> = {}): ReadingEventBatchPayload {
  const payload = {
    page: {
      pageId: 'page-1',
      domain: 'example.com',
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 240,
      capturedAt,
    },
    chunks: [
      {
        chunkId: 'chunk-1',
        pageId: 'page-1',
        textHash: 'chunk-text-1',
        text: 'Mitigate memory overhead and fail gracefully across retryable extension storage writes.',
        wordCount: 120,
        sentenceCount: 1,
        selector: 'p#one',
      },
      {
        chunkId: 'chunk-2',
        pageId: 'page-1',
        textHash: 'chunk-text-2',
        text: 'Budgeted viewport exposure should allocate attention instead of duplicating reading speed.',
        wordCount: 120,
        sentenceCount: 1,
        selector: 'p#two',
      },
    ],
    events: [
      {
        id: 'TextViewportExposureTick_event-1',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'TextViewportExposureTick',
        occurredAt: capturedAt,
        confidence: 'high',
        value: {
          tickMs: 60_000,
          baseWordsPerMinute: 120,
          activeTab: true,
          documentVisible: true,
          scrollSpeedWordsPerMinute: 0,
          idleAgeMs: 0,
          visibleChunks: [
            {
              chunkId: 'chunk-1',
              wordCount: 120,
              visibleRatio: 1,
              centerDistance: 0,
              contentWeight: 1,
            },
            {
              chunkId: 'chunk-2',
              wordCount: 120,
              visibleRatio: 1,
              centerDistance: 0,
              contentWeight: 1,
            },
          ],
        },
      },
    ],
    ...overrides,
  };

  return payload as unknown as ReadingEventBatchPayload;
}

describe('summarizeReadingEventBatch', () => {
  it('turns a viewport exposure tick into budgeted chunk, page, and daily increments', () => {
    const summary = summarizeReadingEventBatch(createPayload());

    expect(summary.chunkUpdates).toEqual([
      expect.objectContaining({
        chunkId: 'chunk-1',
        rawExposureMs: 60_000,
        effectiveReadingMs: 30_000,
        effectiveWords: 60,
        newWords: 60,
        reviewWords: 0,
      }),
      expect.objectContaining({
        chunkId: 'chunk-2',
        rawExposureMs: 60_000,
        effectiveReadingMs: 30_000,
        effectiveWords: 60,
        newWords: 60,
        reviewWords: 0,
      }),
    ]);
    expect(summary.pageEffectiveWords).toBeCloseTo(120, 6);
    expect(summary.pageNewWords).toBeCloseTo(120, 6);
    expect(summary.pageReviewWords).toBeCloseTo(0, 6);
    expect(summary.totalRawExposureMs).toBe(60_000);
    expect(summary.totalEffectiveReadingMs).toBeCloseTo(60_000, 6);
    expect(summary.dailyUpdates).toEqual([
      expect.objectContaining({
        date: '2026-06-27',
        effectiveWords: 120,
        newWords: 120,
        reviewWords: 0,
        minutes: 1,
        rawExposureMs: 60_000,
        effectiveReadingMs: 60_000,
      }),
    ]);
  });

  it('records raw exposure without daily effective reading for inactive viewport ticks', () => {
    const payload = createPayload();
    const viewportEvent = payload.events[0];
    viewportEvent.value = {
      ...viewportEvent.value,
      activeTab: false,
    };

    const summary = summarizeReadingEventBatch(payload);

    expect(summary.totalRawExposureMs).toBe(60_000);
    expect(summary.totalEffectiveReadingMs).toBe(0);
    expect(summary.pageEffectiveWords).toBe(0);
    expect(summary.dailyUpdates).toEqual([]);
  });

  it('applies session, day, and lifetime counters while splitting new and review words', () => {
    const summary = summarizeReadingEventBatch(createPayload({ chunks: [createPayload().chunks[0]] }), {
      chunkStates: new Map([
        [
          'chunk-1',
          {
            sessionEffectiveWords: 30,
            todayEffectiveWords: 70,
            lifetimeEffectiveWords: 110,
          },
        ],
      ]),
    });

    expect(summary.chunkUpdates).toEqual([
      expect.objectContaining({
        chunkId: 'chunk-1',
        effectiveWords: 50,
        newWords: 10,
        reviewWords: 40,
        effectiveReadingMs: 25_000,
      }),
    ]);
    expect(summary.pageEffectiveWords).toBeCloseTo(50, 6);
    expect(summary.pageNewWords).toBeCloseTo(10, 6);
    expect(summary.pageReviewWords).toBeCloseTo(40, 6);
  });
});
