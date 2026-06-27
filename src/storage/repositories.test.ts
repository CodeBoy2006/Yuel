import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { clearLocalReadingData, pruneExpiredReadingEvents, recordReadingEventBatch } from './repositories';

const mocks = vi.hoisted(() => {
  const pages = {
    clear: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const textChunks = {
    clear: vi.fn(),
    get: vi.fn(),
    bulkPut: vi.fn(),
  };
  const readingEvents = {
    bulkGet: vi.fn(),
    bulkPut: vi.fn(),
    clear: vi.fn(),
    where: vi.fn(),
  };
  const vocabExposures = {
    clear: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const savedItems = {
    clear: vi.fn(),
  };
  const dailyStats = {
    clear: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const db = {
    pages,
    textChunks,
    readingEvents,
    vocabExposures,
    savedItems,
    dailyStats,
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === 'function') {
        await callback();
      }
    }),
  };

  return { db, dailyStats, pages, readingEvents, savedItems, textChunks, vocabExposures };
});

vi.mock('./schema', () => ({
  db: mocks.db,
}));

const capturedAt = Date.UTC(2026, 5, 27, 12, 0, 0);

function createPayload(): ReadingEventBatchPayload {
  return {
    page: {
      pageId: 'page-1',
      domain: 'docs.example.com',
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 8,
      capturedAt,
    },
    chunks: [
      {
        chunkId: 'chunk-1',
        pageId: 'page-1',
        textHash: 'chunk-text',
        text: 'Mitigate memory overhead and fail gracefully under pressure.',
        wordCount: 8,
        sentenceCount: 1,
        selector: 'p',
      },
    ],
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
          wordCount: 8,
          activeTab: true,
        },
      },
    ],
  };
}

describe('recordReadingEventBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(capturedAt + 60_000);
    mocks.pages.get.mockResolvedValue(undefined);
    mocks.textChunks.get.mockResolvedValue(undefined);
    mocks.vocabExposures.get.mockResolvedValue(undefined);
    mocks.dailyStats.get.mockResolvedValue(undefined);
    mocks.readingEvents.bulkGet.mockResolvedValue([]);
    mocks.readingEvents.where.mockReturnValue({
      below: vi.fn(() => ({
        delete: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores pack tags on vocabulary exposures matched by the bundled tech pack', async () => {
    await recordReadingEventBatch(createPayload());

    const vocabRecords = mocks.vocabExposures.put.mock.calls.map(([record]) => record);

    expect(vocabRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lemma: 'mitigate',
          packTags: ['architecture', 'risk'],
        }),
        expect.objectContaining({
          lemma: 'overhead',
          packTags: ['performance'],
        }),
      ]),
    );
  });

  it('merges newly matched pack tags into existing vocabulary exposures', async () => {
    mocks.vocabExposures.get.mockImplementation(async (lemma: string) =>
      lemma === 'mitigate'
        ? {
            lemma: 'mitigate',
            language: 'en',
            seenCount: 2,
            effectiveSeenCount: 2,
            lookupCount: 0,
            savedCount: 0,
            lastSeenAt: capturedAt - 1_000,
            packTags: ['existing'],
            userStatus: 'new',
          }
        : undefined,
    );

    await recordReadingEventBatch(createPayload());

    const mitigateRecord = mocks.vocabExposures.put.mock.calls
      .map(([record]) => record)
      .find((record) => record.lemma === 'mitigate');

    expect(mitigateRecord).toMatchObject({
      lemma: 'mitigate',
      seenCount: 3,
      effectiveSeenCount: 3,
      packTags: ['existing', 'architecture', 'risk'],
    });
  });

  it('normalizes blank page domains before storing page and daily aggregates', async () => {
    const payload = createPayload();
    payload.page = {
      ...payload.page,
      domain: '   ',
    };

    await recordReadingEventBatch(payload);

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        domain: 'unknown',
      }),
    );
    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-06-27',
        topDomains: ['unknown'],
      }),
    );
  });

  it('normalizes existing daily top domains when recording new aggregates', async () => {
    mocks.dailyStats.get.mockResolvedValueOnce({
      date: '2026-06-27',
      effectiveWords: 10,
      minutes: 1,
      advancedWords: 0,
      expressions: 0,
      streak: 0,
      topDomains: ['  docs.example.com  ', '', 'github.com', 'docs.example.com', '   '],
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-06-27',
        topDomains: ['docs.example.com', 'github.com'],
      }),
    );
  });

  it('does not record vocabulary exposure when measured reading is ineffective', async () => {
    const payload = createPayload();
    payload.events = [
      {
        ...payload.events[0],
        value: {
          ...payload.events[0].value,
          activeTab: false,
          idle: true,
          scrollSpeedWordsPerMinute: 1_500,
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
  });

  it('does not refresh a previously read page timestamp for ineffective reading ticks', async () => {
    const previousReadAt = capturedAt - 24 * 60 * 60 * 1_000;
    mocks.pages.get.mockResolvedValueOnce({
      pageId: 'page-1',
      domain: 'docs.example.com',
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 8,
      effectiveWords: 120,
      difficultyScore: 0,
      firstSeenAt: previousReadAt - 60_000,
      lastReadAt: previousReadAt,
    });
    const payload = createPayload();
    payload.events = [
      {
        ...payload.events[0],
        value: {
          ...payload.events[0].value,
          activeTab: false,
          idle: true,
          scrollSpeedWordsPerMinute: 1_500,
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        effectiveWords: 120,
        lastReadAt: previousReadAt,
      }),
    );
    expect(mocks.dailyStats.put).not.toHaveBeenCalled();
  });

  it('does not record vocabulary exposure when a chunk has no new effective words to count', async () => {
    mocks.textChunks.get.mockResolvedValueOnce({
      chunkId: 'chunk-1',
      pageId: 'page-1',
      textHash: 'chunk-text',
      wordCount: 8,
      sentenceCount: 1,
      difficulty: 0,
      exposureSeconds: 30,
      effectiveWords: 8,
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
  });

  it('does not record duplicate vocabulary exposure when an already credited chunk gains more effective words', async () => {
    mocks.textChunks.get.mockResolvedValueOnce({
      chunkId: 'chunk-1',
      pageId: 'page-1',
      textHash: 'chunk-text',
      wordCount: 8,
      sentenceCount: 1,
      difficulty: 0,
      exposureSeconds: 10,
      effectiveWords: 4,
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
  });

  it('does not aggregate duplicate reading events that are already stored locally', async () => {
    const payload = createPayload();
    mocks.readingEvents.bulkGet.mockResolvedValueOnce([payload.events[0]]);

    await recordReadingEventBatch(payload);

    expect(mocks.readingEvents.bulkGet).toHaveBeenCalledWith(['event-1']);
    expect(mocks.pages.put).not.toHaveBeenCalled();
    expect(mocks.textChunks.bulkPut).not.toHaveBeenCalled();
    expect(mocks.readingEvents.bulkPut).not.toHaveBeenCalled();
    expect(mocks.dailyStats.put).not.toHaveBeenCalled();
    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
  });

  it('prunes raw reading events older than the local retention window after recording a batch', async () => {
    const deleteOldEvents = vi.fn();
    const belowRetentionCutoff = vi.fn(() => ({
      delete: deleteOldEvents,
    }));
    mocks.readingEvents.where.mockReturnValue({
      below: belowRetentionCutoff,
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.readingEvents.where).toHaveBeenCalledWith('occurredAt');
    expect(belowRetentionCutoff).toHaveBeenCalledWith(capturedAt + 60_000 - 7 * 24 * 60 * 60 * 1_000);
    expect(deleteOldEvents).toHaveBeenCalledOnce();
  });

  it('exposes reading event pruning for scheduled maintenance', async () => {
    const deleteOldEvents = vi.fn();
    const belowRetentionCutoff = vi.fn(() => ({
      delete: deleteOldEvents,
    }));
    mocks.readingEvents.where.mockReturnValue({
      below: belowRetentionCutoff,
    });

    await pruneExpiredReadingEvents(capturedAt + 120_000);

    expect(mocks.readingEvents.where).toHaveBeenCalledWith('occurredAt');
    expect(belowRetentionCutoff).toHaveBeenCalledWith(capturedAt + 120_000 - 7 * 24 * 60 * 60 * 1_000);
    expect(deleteOldEvents).toHaveBeenCalledOnce();
  });

  it('clears local reading data tables without touching extension settings', async () => {
    await clearLocalReadingData();

    expect(mocks.pages.clear).toHaveBeenCalledOnce();
    expect(mocks.textChunks.clear).toHaveBeenCalledOnce();
    expect(mocks.readingEvents.clear).toHaveBeenCalledOnce();
    expect(mocks.vocabExposures.clear).toHaveBeenCalledOnce();
    expect(mocks.savedItems.clear).toHaveBeenCalledOnce();
    expect(mocks.dailyStats.clear).toHaveBeenCalledOnce();
  });
});
