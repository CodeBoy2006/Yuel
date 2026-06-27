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
