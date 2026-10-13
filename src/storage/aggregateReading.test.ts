import { describe, expect, it } from 'vitest';

import { formatLocalDate } from '../domain/localDate';
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
    expect(summary.sessionUpdates).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        date: '2026-06-27',
        startedAt: capturedAt - 60_000,
        endedAt: capturedAt,
        effectiveReadingMs: 60_000,
        effectiveWords: 120,
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
    expect(summary.sessionUpdates).toEqual([]);
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

  it('uses a stored reading pace override instead of the collector default WPM', () => {
    const summary = summarizeReadingEventBatch(createPayload(), {
      baseWordsPerMinute: 180,
    });

    expect(summary.pageEffectiveWords).toBeCloseTo(180, 6);
    expect(summary.totalEffectiveReadingMs).toBeCloseTo(60_000, 6);
    expect(summary.chunkUpdates.map((update) => update.effectiveWords)).toEqual([
      expect.closeTo(90, 6),
      expect.closeTo(90, 6),
    ]);
  });

  it('accumulates multiple ticks without changing supplied state maps or entries', () => {
    const payload = createPayload();
    payload.events.push({
      ...payload.events[0],
      id: 'TextViewportExposureTick_event-2',
      occurredAt: capturedAt + 60_000,
    });
    const date = formatLocalDate(capturedAt);
    const chunkState = Object.freeze({
      sessionEffectiveWords: 0,
      todayEffectiveWords: 0,
      lifetimeEffectiveWords: 110,
    });
    const dayState = Object.freeze({ effectiveWords: 0 });
    const chunkStates = new Map([['chunk-1', chunkState]]);
    const dayStates = new Map([['chunk-1', dayState]]);
    const chunkDayStates = new Map([[date, dayStates]]);

    const summary = summarizeReadingEventBatch(payload, { chunkStates, chunkDayStates });

    expect(summary.pageEffectiveWords).toBe(240);
    expect(summary.pageNewWords).toBe(130);
    expect(summary.pageReviewWords).toBe(110);
    expect(summary.dailyUpdates).toEqual([expect.objectContaining({
      date,
      effectiveWords: 240,
      newWords: 130,
      reviewWords: 110,
    })]);
    expect(chunkStates.size).toBe(1);
    expect(chunkStates.get('chunk-1')).toBe(chunkState);
    expect(chunkDayStates.size).toBe(1);
    expect(chunkDayStates.get(date)).toBe(dayStates);
    expect(dayStates.size).toBe(1);
    expect(dayStates.get('chunk-1')).toBe(dayState);
  });

  it('persists local-rate words while keeping directly allocated attention time', () => {
    const payload = createPayload({ chunks: [createPayload().chunks[0]] });
    payload.events[0].value = {
      ...payload.events[0].value,
      tickMs: 15_000,
      baseWordsPerMinute: 220,
      visibleChunks: [
        {
          chunkId: 'chunk-1',
          wordCount: 120,
          visibleRatio: 1,
          centerDistance: 0,
          contentWeight: 0.2,
          contentMultiplier: 0.2,
        },
      ],
    };

    const summary = summarizeReadingEventBatch(payload);

    expect(summary.pageEffectiveWords).toBeCloseTo(11, 6);
    expect(summary.totalEffectiveReadingMs).toBeCloseTo(15_000, 6);
    expect(summary.chunkUpdates).toEqual([
      expect.objectContaining({
        chunkId: 'chunk-1',
        effectiveWords: expect.closeTo(11, 6),
        effectiveReadingMs: expect.closeTo(15_000, 6),
      }),
    ]);
    expect(summary.dailyUpdates).toEqual([
      expect.objectContaining({
        effectiveWords: expect.closeTo(11, 6),
        minutes: expect.closeTo(0.25, 6),
      }),
    ]);
  });

  it('records raw exposure for capped visible chunks when other chunks still receive effective allocation', () => {
    const summary = summarizeReadingEventBatch(createPayload(), {
      chunkStates: new Map([
        [
          'chunk-1',
          {
            sessionEffectiveWords: 120,
            todayEffectiveWords: 120,
            lifetimeEffectiveWords: 120,
          },
        ],
      ]),
    });

    expect(summary.chunkUpdates).toEqual([
      expect.objectContaining({
        chunkId: 'chunk-1',
        rawExposureMs: 60_000,
        effectiveReadingMs: 0,
        effectiveWords: 0,
        newWords: 0,
        reviewWords: 0,
      }),
      expect.objectContaining({
        chunkId: 'chunk-2',
        rawExposureMs: 60_000,
        effectiveWords: 120,
      }),
    ]);
    expect(summary.chunkDayUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chunkId: 'chunk-1',
          rawExposureMs: 60_000,
          effectiveReadingMs: 0,
          effectiveWords: 0,
        }),
        expect.objectContaining({
          chunkId: 'chunk-2',
          rawExposureMs: 60_000,
          effectiveWords: 120,
        }),
      ]),
    );
    expect(summary.pageEffectiveWords).toBeCloseTo(120, 6);
    expect(summary.totalRawExposureMs).toBe(60_000);
  });
});
