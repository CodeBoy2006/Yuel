import { describe, expect, it } from 'vitest';

import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { summarizeReadingEventBatch } from './aggregateReading';

const capturedAt = Date.UTC(2026, 5, 27, 12, 0, 0);

function createPayload(overrides: Partial<ReadingEventBatchPayload> = {}): ReadingEventBatchPayload {
  return {
    page: {
      pageId: 'page-1',
      domain: 'example.com',
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 100,
      capturedAt,
    },
    chunks: [
      {
        chunkId: 'chunk-1',
        pageId: 'page-1',
        textHash: 'chunk-text',
        text: 'Mitigate memory overhead and fail gracefully.',
        wordCount: 100,
        sentenceCount: 1,
        selector: 'p',
      },
    ],
    events: [],
    ...overrides,
  };
}

describe('summarizeReadingEventBatch', () => {
  it('turns text block exposure ticks into chunk, page, and daily increments', () => {
    const summary = summarizeReadingEventBatch(
      createPayload({
        events: [
          {
            id: 'event-1',
            sessionId: 'session-1',
            pageId: 'page-1',
            chunkId: 'chunk-1',
            kind: 'TextBlockExposureTick',
            occurredAt: capturedAt,
            confidence: 'high',
            value: {
              visibleRatio: 1,
              dwellMs: 30_000,
              wordCount: 100,
              activeTab: true,
            },
          },
        ],
      }),
    );

    expect(summary.chunkUpdates).toEqual([
      {
        chunkId: 'chunk-1',
        exposureSeconds: 30,
        effectiveWords: 100,
      },
    ]);
    expect(summary.pageEffectiveWords).toBe(100);
    expect(summary.totalExposureSeconds).toBe(30);
    expect(summary.dailyUpdates).toEqual([
      {
        date: '2026-06-27',
        effectiveWords: 100,
        minutes: 0.5,
      },
    ]);
  });

  it('ignores events that do not represent measurable chunk exposure', () => {
    const summary = summarizeReadingEventBatch(
      createPayload({
        events: [
          {
            id: 'event-1',
            sessionId: 'session-1',
            pageId: 'page-1',
            kind: 'PageVisible',
            occurredAt: capturedAt,
            confidence: 'medium',
          },
          {
            id: 'event-2',
            sessionId: 'session-1',
            pageId: 'page-1',
            chunkId: 'missing-chunk',
            kind: 'TextBlockExposureTick',
            occurredAt: capturedAt,
            confidence: 'high',
            value: {
              visibleRatio: 1,
              dwellMs: 30_000,
              wordCount: 100,
            },
          },
        ],
      }),
    );

    expect(summary.chunkUpdates).toEqual([]);
    expect(summary.pageEffectiveWords).toBe(0);
    expect(summary.totalExposureSeconds).toBe(0);
    expect(summary.dailyUpdates).toEqual([]);
  });
});
