import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReadingEventBatchPayload } from '../messaging/contracts';
import {
  clearLocalReadingData,
  pruneExpiredReadingEvents,
  pruneExpiredReadingPaceEpisodes,
  recordReadingEventBatch,
} from './repositories';
import type { DailyStatRecord, ReadingPaceEpisodeRecord } from './schema';

const mocks = vi.hoisted(() => {
  const textChunksGet = vi.fn();
  const pages = {
    clear: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const textChunks = {
    clear: vi.fn(),
    get: textChunksGet,
    bulkGet: vi.fn(async (ids: string[]) => Promise.all(ids.map((id) => textChunksGet(id)))),
    bulkPut: vi.fn(),
  };
  const chunkSessionsGet = vi.fn();
  const chunkSessions = {
    clear: vi.fn(),
    get: chunkSessionsGet,
    bulkGet: vi.fn(async (ids: string[]) => Promise.all(ids.map((id) => chunkSessionsGet(id)))),
    put: vi.fn(),
  };
  const chunkDaysGet = vi.fn();
  const chunkDays = {
    clear: vi.fn(),
    get: chunkDaysGet,
    bulkGet: vi.fn(async (ids: string[]) => Promise.all(ids.map((id) => chunkDaysGet(id)))),
    put: vi.fn(),
  };
  const readingEvents = {
    bulkGet: vi.fn(),
    bulkPut: vi.fn(),
    clear: vi.fn(),
    where: vi.fn(),
  };
  const readingSessions = {
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
  const pdfAnnotations = {
    clear: vi.fn(),
  };
  const pdfDocumentStates = {
    clear: vi.fn(),
  };
  const dailyStats = {
    clear: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const readingPaceProfiles = {
    clear: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const readingPaceEpisodes = {
    clear: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    where: vi.fn(),
  };
  const metadata = {
    get: vi.fn(),
    put: vi.fn(),
  };
  const db = {
    pages,
    textChunks,
    chunkSessions,
    chunkDays,
    readingEvents,
    readingSessions,
    vocabExposures,
    savedItems,
    pdfAnnotations,
    pdfDocumentStates,
    dailyStats,
    readingPaceProfiles,
    readingPaceEpisodes,
    metadata,
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === 'function') {
        await callback();
      }
    }),
  };

  return {
    chunkDays,
    chunkSessions,
    db,
    dailyStats,
    metadata,
    pages,
    pdfAnnotations,
    pdfDocumentStates,
    readingEvents,
    readingPaceEpisodes,
    readingPaceProfiles,
    readingSessions,
    savedItems,
    textChunks,
    vocabExposures,
  };
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
        id: 'TextViewportExposureTick_event-1',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'TextViewportExposureTick',
        occurredAt: capturedAt,
        confidence: 'high',
        value: {
          tickMs: 30_000,
          baseWordsPerMinute: 220,
          activeTab: true,
          documentVisible: true,
          scrollSpeedWordsPerMinute: 0,
          idleAgeMs: 0,
          visibleChunks: [
            {
              chunkId: 'chunk-1',
              wordCount: 8,
              visibleRatio: 1,
              centerDistance: 0,
              contentWeight: 1,
            },
          ],
        },
      },
    ],
  };
}

function createAdaptiveEpisodeSeedPayload(): ReadingEventBatchPayload {
  const payload = createPayload();
  payload.page = {
    ...payload.page,
    totalWords: 300,
  };
  payload.events = [
    {
      ...payload.events[0],
      value: {
        ...payload.events[0].value,
        tickMs: 1_000,
        visibleChunks: [
          {
            chunkId: 'chunk-1',
            wordCount: 8,
            visibleRatio: 1,
            centerDistance: 0,
            viewportY: 0.5,
            attentionMass: 8,
            contentMultiplier: 1,
            contentWeight: 1,
          },
        ],
      },
    },
  ];
  return payload;
}

describe('recordReadingEventBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(capturedAt + 60_000);
    mocks.pages.get.mockResolvedValue(undefined);
    mocks.textChunks.get.mockResolvedValue(undefined);
    mocks.chunkSessions.get.mockResolvedValue(undefined);
    mocks.chunkDays.get.mockResolvedValue(undefined);
    mocks.vocabExposures.get.mockResolvedValue(undefined);
    mocks.dailyStats.get.mockResolvedValue(undefined);
    mocks.readingPaceProfiles.get.mockResolvedValue(undefined);
    mocks.readingPaceEpisodes.get.mockResolvedValue(undefined);
    mocks.metadata.get.mockImplementation(async (key: string) => key === 'dailyCheckInThresholdWords'
      ? { key, numberValue: 1 }
      : undefined);
    mocks.readingEvents.bulkGet.mockResolvedValue([]);
    mocks.readingEvents.where.mockReturnValue({
      below: vi.fn(() => ({
        delete: vi.fn(),
      })),
    });
    mocks.readingSessions.where.mockReturnValue({
      equals: vi.fn(() => ({
        toArray: vi.fn(async () => []),
      })),
    });
    mocks.readingPaceEpisodes.where.mockReturnValue({
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

  it('loads segment, session, and day cap state with one bulk read per table', async () => {
    await recordReadingEventBatch(createPayload());

    expect(mocks.textChunks.bulkGet).toHaveBeenCalledOnce();
    expect(mocks.textChunks.bulkGet).toHaveBeenCalledWith(['chunk-1']);
    expect(mocks.chunkSessions.bulkGet).toHaveBeenCalledWith(['session-1:chunk-1']);
    expect(mocks.chunkDays.bulkGet).toHaveBeenCalledWith(['2026-06-27:chunk-1']);
    expect(mocks.readingSessions.where).toHaveBeenCalledWith('sessionId');
  });

  it('stores effective reading intervals as durable session records', async () => {
    await recordReadingEventBatch(createPayload());

    expect(mocks.readingSessions.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({
        id: `session-1:2026-06-27:${capturedAt - 30_000}`,
        sessionId: 'session-1',
        date: '2026-06-27',
        pageId: 'page-1',
        domain: 'docs.example.com',
        startedAt: capturedAt - 30_000,
        endedAt: capturedAt,
        effectiveReadingMs: expect.closeTo(8 / 220 * 60_000, 6),
        effectiveWords: 8,
      }),
    ]);
  });

  it('merges adjacent effective intervals for the same page and technical session', async () => {
    const existingEffectiveReadingMs = 1_500;
    mocks.readingSessions.where.mockReturnValueOnce({
      equals: vi.fn(() => ({
        toArray: vi.fn(async () => [{
          id: 'stored-session',
          sessionId: 'session-1',
          date: '2026-06-27',
          pageId: 'page-1',
          domain: 'docs.example.com',
          startedAt: capturedAt - 90_000,
          endedAt: capturedAt - 45_000,
          effectiveReadingMs: existingEffectiveReadingMs,
          effectiveWords: 4,
          confidence: 0.5,
        }]),
      })),
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.readingSessions.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'stored-session',
        startedAt: capturedAt - 90_000,
        endedAt: capturedAt,
        effectiveReadingMs: expect.closeTo(existingEffectiveReadingMs + 8 / 220 * 60_000, 6),
        effectiveWords: 12,
      }),
    ]);
  });

  it('starts a new stored interval after a five-minute reading break', async () => {
    mocks.readingSessions.where.mockReturnValueOnce({
      equals: vi.fn(() => ({
        toArray: vi.fn(async () => [{
          id: 'stored-session',
          sessionId: 'session-1',
          date: '2026-06-27',
          pageId: 'page-1',
          domain: 'docs.example.com',
          startedAt: capturedAt - 10 * 60_000,
          endedAt: capturedAt - 6 * 60_000,
          effectiveReadingMs: 60_000,
          effectiveWords: 100,
          confidence: 0.8,
        }]),
      })),
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.readingSessions.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({
        id: `session-1:2026-06-27:${capturedAt - 30_000}`,
        startedAt: capturedAt - 30_000,
        endedAt: capturedAt,
      }),
    ]);
  });

  it('persists PDF resource and physical section identities without changing table indexes', async () => {
    const payload = createPayload();
    payload.page = {
      ...payload.page,
      resourceType: 'pdf',
      resourceId: 'pdf_abc123',
    };
    payload.chunks = payload.chunks.map((chunk) => ({
      ...chunk,
      sectionId: 'pdf_abc123_page_1',
    }));

    await recordReadingEventBatch(payload);

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'pdf',
        resourceId: 'pdf_abc123',
      }),
    );
    expect(mocks.textChunks.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({
        chunkId: 'chunk-1',
        sectionId: 'pdf_abc123_page_1',
      }),
    ]);
  });

  it('stores page-only sparse PDF batches without requiring document chunks', async () => {
    const payload = createPayload();
    payload.page = {
      ...payload.page,
      resourceType: 'pdf',
      resourceId: 'pdf_abc123',
      totalWords: 16,
      metricModelVersion: 2,
    };
    payload.chunks = [];
    payload.events = [{
      id: 'PageVisible_event-1',
      sessionId: 'session-1',
      pageId: payload.page.pageId,
      kind: 'PageVisible',
      occurredAt: capturedAt,
      confidence: 'medium',
    }];

    await recordReadingEventBatch(payload);

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'pdf',
        resourceId: 'pdf_abc123',
        totalWords: 16,
        coveredWords: 0,
      }),
    );
    expect(mocks.textChunks.bulkPut).not.toHaveBeenCalled();
  });

  it('accumulates coverage across sparse batches for distinct chunks of the same PDF', async () => {
    const firstPayload = createPayload();
    firstPayload.page = {
      ...firstPayload.page,
      resourceType: 'pdf',
      resourceId: 'pdf_abc123',
      totalWords: 16,
      metricModelVersion: 2,
    };
    firstPayload.chunks = firstPayload.chunks.map((chunk) => ({
      ...chunk,
      sectionId: 'pdf_abc123_page_1',
    }));

    await recordReadingEventBatch(firstPayload);

    const firstPageRecord = mocks.pages.put.mock.calls[0][0];
    mocks.pages.get.mockResolvedValueOnce(firstPageRecord);
    const secondText = 'Budget visible reading accurately across independent PDF sections.';
    const secondPayload: ReadingEventBatchPayload = {
      page: firstPayload.page,
      chunks: [{
        chunkId: 'chunk-2',
        pageId: firstPayload.page.pageId,
        sectionId: 'pdf_abc123_page_2',
        textHash: 'chunk-text-2',
        text: secondText,
        wordCount: 8,
        sentenceCount: 1,
        selector: 'pdf-page(2)::segment(1)',
      }],
      events: [{
        ...firstPayload.events[0],
        id: 'TextViewportExposureTick_event-2',
        occurredAt: capturedAt + 30_000,
        value: {
          ...firstPayload.events[0].value,
          visibleChunks: [{
            chunkId: 'chunk-2',
            wordCount: 8,
            visibleRatio: 1,
            centerDistance: 0,
            contentWeight: 1,
          }],
        },
      }],
    };

    await recordReadingEventBatch(secondPayload);

    expect(mocks.pages.put.mock.calls.map(([record]) => record.coveredWords)).toEqual([
      8,
      16,
    ]);
    expect(mocks.pages.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resourceType: 'pdf',
        resourceId: 'pdf_abc123',
        totalWords: 16,
        coveredWords: 16,
        newWords: 16,
      }),
    );
  });

  it('uses event time rather than delayed processing time for page and vocabulary recency', async () => {
    await recordReadingEventBatch(createPayload());

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({ lastReadAt: capturedAt, snapshotCapturedAt: capturedAt }),
    );
    expect(mocks.vocabExposures.put).toHaveBeenCalledWith(
      expect.objectContaining({ lastSeenAt: capturedAt }),
    );
  });

  it('does not move page or vocabulary recency backward when an older batch finishes late', async () => {
    const newerReadAt = capturedAt + 30_000;
    mocks.pages.get.mockResolvedValueOnce({
      pageId: 'page-1',
      domain: 'docs.example.com',
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 8,
      effectiveWords: 4,
      firstSeenAt: capturedAt - 1_000,
      lastReadAt: newerReadAt,
    });
    mocks.vocabExposures.get.mockImplementation(async (lemma: string) =>
      lemma === 'mitigate'
        ? {
            lemma,
            language: 'en',
            seenCount: 1,
            effectiveSeenCount: 1,
            savedCount: 0,
            lastSeenAt: newerReadAt,
            packTags: [],
            userStatus: 'new',
          }
        : undefined,
    );

    await recordReadingEventBatch(createPayload());

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({ lastReadAt: newerReadAt }),
    );
    expect(mocks.vocabExposures.put).toHaveBeenCalledWith(
      expect.objectContaining({ lemma: 'mitigate', lastSeenAt: newerReadAt }),
    );
  });

  it('keeps a newer page snapshot while still accumulating events from an older snapshot', async () => {
    const newerSnapshotCapturedAt = capturedAt + 60_000;
    mocks.pages.get.mockResolvedValueOnce({
      pageId: 'page-1',
      domain: 'newer.example.com',
      titleHash: 'newer-title',
      urlHash: 'newer-url',
      language: 'fr',
      totalWords: 24,
      effectiveWords: 4,
      coveredWords: 4,
      rawExposureMs: 5_000,
      effectiveReadingMs: 1_000,
      firstSeenAt: capturedAt - 1_000,
      lastReadAt: newerSnapshotCapturedAt,
      snapshotCapturedAt: newerSnapshotCapturedAt,
    });
    const payload = createPayload();
    payload.page = {
      ...payload.page,
      domain: 'older.example.com',
      titleHash: 'older-title',
      urlHash: 'older-url',
      language: 'en',
      totalWords: 8,
    };

    await recordReadingEventBatch(payload);

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'newer.example.com',
        titleHash: 'newer-title',
        urlHash: 'newer-url',
        language: 'fr',
        totalWords: 24,
        coveredWords: 4,
        snapshotCapturedAt: newerSnapshotCapturedAt,
        effectiveWords: 12,
        rawExposureMs: 35_000,
      }),
    );
    expect(mocks.readingEvents.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'TextViewportExposureTick_event-1' }),
    ]);
  });

  it('uses legacy lastReadAt as the snapshot freshness fallback', async () => {
    const legacyLastReadAt = capturedAt + 30_000;
    mocks.pages.get.mockResolvedValueOnce({
      pageId: 'page-1',
      domain: 'legacy-newer.example.com',
      titleHash: 'legacy-newer-title',
      urlHash: 'legacy-newer-url',
      language: 'en',
      totalWords: 16,
      effectiveWords: 4,
      coveredWords: 4,
      firstSeenAt: capturedAt - 1_000,
      lastReadAt: legacyLastReadAt,
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'legacy-newer.example.com',
        titleHash: 'legacy-newer-title',
        totalWords: 16,
        coveredWords: 4,
        snapshotCapturedAt: undefined,
        effectiveWords: 12,
      }),
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

  it('does not refresh ignored vocabulary from passive reading exposure', async () => {
    mocks.vocabExposures.get.mockImplementation(async (lemma: string) =>
      lemma === 'mitigate'
        ? {
            lemma: 'mitigate',
            language: 'en',
            seenCount: 5,
            effectiveSeenCount: 5,
            savedCount: 0,
            lastSeenAt: capturedAt - 1_000,
            packTags: ['architecture'],
            userStatus: 'ignored',
          }
        : undefined,
    );

    await recordReadingEventBatch(createPayload());

    const vocabRecords = mocks.vocabExposures.put.mock.calls.map(([record]) => record);

    expect(vocabRecords).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lemma: 'mitigate',
        }),
      ]),
    );
    expect(vocabRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lemma: 'overhead',
        }),
      ]),
    );
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
          documentVisible: true,
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
          documentVisible: true,
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
      exposureSeconds: 30,
      effectiveWords: 8,
    });
    mocks.chunkSessions.get.mockResolvedValueOnce({
      id: 'session-1:chunk-1',
      sessionId: 'session-1',
      chunkId: 'chunk-1',
      effectiveWords: 8,
    });
    mocks.chunkDays.get.mockResolvedValueOnce({
      id: '2026-06-27:chunk-1',
      date: '2026-06-27',
      chunkId: 'chunk-1',
      effectiveWords: 8,
      newWords: 8,
      reviewWords: 0,
      rawExposureMs: 30_000,
      effectiveReadingMs: 30_000,
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({ coveredWords: 8 }),
    );
  });

  it('seeds v2 segment coverage from the legacy page baseline without recounting old words as new', async () => {
    mocks.pages.get.mockResolvedValueOnce({
      pageId: 'page-1',
      domain: 'docs.example.com',
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 8,
      metricModelVersion: 1,
      effectiveWords: 4,
      coveredWords: 4,
      newWords: 4,
      firstSeenAt: capturedAt - 60_000,
      lastReadAt: capturedAt - 30_000,
      snapshotCapturedAt: capturedAt - 60_000,
    });
    const payload = createPayload();
    payload.page = {
      ...payload.page,
      metricModelVersion: 2,
    };

    await recordReadingEventBatch(payload);

    expect(mocks.textChunks.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({
        chunkId: 'chunk-1',
        metricModelVersion: 2,
        effectiveWords: 8,
        newWords: 8,
        reviewWords: 4,
      }),
    ]);
    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        metricModelVersion: 2,
        coveredWords: 8,
        newWords: 8,
        reviewWords: 4,
      }),
    );
  });

  it('records proportional vocabulary exposure when a partially credited chunk gains effective coverage', async () => {
    mocks.textChunks.get.mockResolvedValueOnce({
      chunkId: 'chunk-1',
      pageId: 'page-1',
      textHash: 'chunk-text',
      wordCount: 8,
      sentenceCount: 1,
      exposureSeconds: 10,
      effectiveWords: 4,
    });
    mocks.chunkSessions.get.mockResolvedValueOnce({
      id: 'session-1:chunk-1',
      sessionId: 'session-1',
      chunkId: 'chunk-1',
      effectiveWords: 4,
    });
    mocks.chunkDays.get.mockResolvedValueOnce({
      id: '2026-06-27:chunk-1',
      date: '2026-06-27',
      chunkId: 'chunk-1',
      effectiveWords: 4,
      newWords: 4,
      reviewWords: 0,
      rawExposureMs: 10_000,
      effectiveReadingMs: 10_000,
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.vocabExposures.put).toHaveBeenCalledWith(
      expect.objectContaining({
        lemma: 'mitigate',
        seenCount: 0.5,
        effectiveSeenCount: 0.5,
      }),
    );
  });

  it('stores session and day chunk caps from budgeted effective allocation', async () => {
    await recordReadingEventBatch(createPayload());

    expect(mocks.chunkSessions.put).toHaveBeenCalledWith({
      id: 'session-1:chunk-1',
      sessionId: 'session-1',
      chunkId: 'chunk-1',
      effectiveWords: 8,
    });
    expect(mocks.chunkDays.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '2026-06-27:chunk-1',
        date: '2026-06-27',
        chunkId: 'chunk-1',
        effectiveWords: 8,
        newWords: 8,
        reviewWords: 0,
      }),
    );
  });

  it('persists aggregate page confidence from effective chunk measurements', async () => {
    await recordReadingEventBatch(createPayload());

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        confidence: expect.closeTo(0.1, 6),
      }),
    );
  });

  it('calculates a real reading streak from consecutive measured days', async () => {
    mocks.dailyStats.get.mockImplementation(async (date: string) => {
      if (date === '2026-06-26' || date === '2026-06-25') {
        return {
          date,
          effectiveWords: 100,
          checkInThresholdWords: 1,
          minutes: 1,
          streak: 0,
          topDomains: [],
        };
      }
      return undefined;
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-06-27',
        streak: 3,
      }),
    );
  });

  it('keeps the daily streak at zero until effective words reach the configured goal', async () => {
    mocks.metadata.get.mockImplementation(async (key: string) => key === 'dailyCheckInThresholdWords'
      ? { key, numberValue: 10 }
      : undefined);

    await recordReadingEventBatch(createPayload());

    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-06-27',
        checkInThresholdWords: 10,
        effectiveWords: 8,
        streak: 0,
      }),
    );
  });

  it('starts a streak when a later batch carries the day across the configured goal', async () => {
    mocks.metadata.get.mockImplementation(async (key: string) => key === 'dailyCheckInThresholdWords'
      ? { key, numberValue: 10 }
      : undefined);
    mocks.dailyStats.get.mockImplementation(async (date: string) => {
      if (date === '2026-06-27') {
        return {
          date,
          effectiveWords: 5,
          checkInThresholdWords: 10,
          minutes: 1,
          streak: 0,
          topDomains: [],
        };
      }
      if (date === '2026-06-26') {
        return {
          date,
          effectiveWords: 20,
          checkInThresholdWords: 10,
          minutes: 1,
          streak: 4,
          topDomains: [],
        };
      }
      return undefined;
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-06-27',
        checkInThresholdWords: 10,
        effectiveWords: 13,
        streak: 5,
      }),
    );
  });

  it('reuses a persisted previous-day streak without rescanning older history', async () => {
    mocks.dailyStats.get.mockImplementation(async (date: string) => {
      if (date === '2026-06-26') {
        return {
          date,
          effectiveWords: 100,
          checkInThresholdWords: 1,
          minutes: 1,
          streak: 41,
          topDomains: [],
        };
      }
      return undefined;
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.dailyStats.get).not.toHaveBeenCalledWith('2026-06-25');
    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-06-27', streak: 42 }),
    );
  });

  it('reuses the current persisted streak on subsequent batches that day', async () => {
    mocks.dailyStats.get.mockImplementation(async (date: string) => {
      if (date === '2026-06-27') {
        return {
          date,
          effectiveWords: 200,
          checkInThresholdWords: 1,
          minutes: 2,
          streak: 42,
          topDomains: [],
        };
      }
      return undefined;
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.dailyStats.get).not.toHaveBeenCalledWith('2026-06-26');
    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-06-27', streak: 42 }),
    );
  });

  it('repairs later streak values when a delayed batch fills an earlier reading day', async () => {
    const dailyStats = new Map<string, DailyStatRecord>([
      ['2026-06-26', {
        date: '2026-06-26',
        effectiveWords: 100,
        minutes: 1,
        streak: 1,
        topDomains: [],
      }],
      ['2026-06-28', {
        date: '2026-06-28',
        effectiveWords: 100,
        minutes: 1,
        streak: 1,
        topDomains: [],
      }],
    ]);
    mocks.dailyStats.get.mockImplementation(async (date: string) => dailyStats.get(date));
    mocks.dailyStats.put.mockImplementation(async (record: DailyStatRecord) => {
      dailyStats.set(record.date, record);
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-06-27', streak: 2 }),
    );
    expect(mocks.dailyStats.put).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-06-28', streak: 3 }),
    );
  });

  it('uses the stored reading pace profile without adapting from non-progression visibility', async () => {
    mocks.readingPaceProfiles.get.mockResolvedValueOnce({
      id: 'en:general',
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 120,
      adaptiveSampleCount: 0,
      source: 'onboarding',
      updatedAt: capturedAt - 1_000,
    });
    const payload = createPayload();
    payload.page = {
      ...payload.page,
      totalWords: 300,
    };
    payload.chunks = [
      {
        chunkId: 'chunk-1',
        pageId: 'page-1',
        textHash: 'chunk-text-1',
        text: 'Mitigate memory overhead and fail gracefully under pressure.',
        wordCount: 150,
        sentenceCount: 1,
        selector: 'p#one',
      },
      {
        chunkId: 'chunk-2',
        pageId: 'page-1',
        textHash: 'chunk-text-2',
        text: 'Budgeted exposure allocates attention across simultaneous viewport text.',
        wordCount: 150,
        sentenceCount: 1,
        selector: 'p#two',
      },
    ];
    payload.events = [
      {
        ...payload.events[0],
        value: {
          ...payload.events[0].value,
          tickMs: 60_000,
          baseWordsPerMinute: 220,
          visibleChunks: [
            {
              chunkId: 'chunk-1',
              wordCount: 150,
              visibleRatio: 1,
              centerDistance: 0,
              contentWeight: 1,
            },
            {
              chunkId: 'chunk-2',
              wordCount: 150,
              visibleRatio: 1,
              centerDistance: 0,
              contentWeight: 1,
            },
          ],
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveWords: expect.closeTo(120, 6),
      }),
    );
    expect(mocks.readingPaceProfiles.put).not.toHaveBeenCalled();
    expect(mocks.readingPaceEpisodes.put).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: payload.events[0].sessionId,
        activeMs: 0,
        completedWords: 0,
      }),
    );
  });

  it('updates the profile once for every qualified forward-reading episode', async () => {
    const profiles = new Map<string, Record<string, unknown>>([
      ['en:general', {
        id: 'en:general',
        language: 'en',
        contentType: 'general',
        baseWordsPerMinute: 120,
        adaptiveSampleCount: 0,
        source: 'onboarding',
        updatedAt: capturedAt - 1_000,
      }],
    ]);
    const episodes = new Map<string, Record<string, unknown>>();
    mocks.readingPaceProfiles.get.mockImplementation(async (id: string) => profiles.get(id));
    mocks.readingPaceProfiles.put.mockImplementation(async (profile: Record<string, unknown>) => {
      profiles.set(String(profile.id), profile);
    });
    mocks.readingPaceEpisodes.get.mockImplementation(async (id: string) => episodes.get(id));
    mocks.readingPaceEpisodes.put.mockImplementation(async (episode: Record<string, unknown>) => {
      episodes.set(String(episode.id), episode);
    });
    mocks.readingPaceEpisodes.delete.mockImplementation(async (id: string) => {
      episodes.delete(id);
    });

    const createEpisodePayload = (
      sessionIndex: number,
      phase: 'center' | 'complete',
    ): ReadingEventBatchPayload => {
      const sessionId = `session_episode_${sessionIndex}`;
      const baseTime = capturedAt + sessionIndex * 100_000;
      const chunks = Array.from({ length: 15 }, (_, index) => ({
        chunkId: `episode-${sessionIndex}-chunk-${index + 1}`,
        pageId: `episode-page-${sessionIndex}`,
        textHash: `episode-text-${index + 1}`,
        text: `Forward reading segment ${index + 1} contains enough ordinary prose words for a stable adaptive sample.`,
        wordCount: 20,
        sentenceCount: 1,
        selector: `p::chunk(${index + 1})`,
      }));
      const visibleChunks = (viewportY: number) => chunks.slice(0, 6).map((chunk) => ({
        chunkId: chunk.chunkId,
        wordCount: chunk.wordCount,
        visibleRatio: 1,
        centerDistance: Math.abs(viewportY - 0.5),
        viewportY,
        attentionMass: chunk.wordCount,
        contentMultiplier: 1,
        contentWeight: 1,
      }));
      const tickEvents = Array.from({ length: 15 }, (_, index) => ({
        id: `TextViewportExposureTick_${sessionIndex}_${phase}_${index}`,
        sessionId,
        pageId: `episode-page-${sessionIndex}`,
        kind: 'TextViewportExposureTick' as const,
        occurredAt: baseTime + (phase === 'center' ? index + 1 : index + 16) * 1_000,
        confidence: 'high' as const,
        value: {
          tickMs: 1_000,
          baseWordsPerMinute: 220,
          activeTab: true,
          documentVisible: true,
          scrollSpeedWordsPerMinute: 0,
          scrollDirection: phase === 'complete' ? 1 : 0,
          idleAgeMs: 0,
          visibleChunks: visibleChunks(phase === 'center' ? 0.5 : 0.1),
        },
      }));
      const events = phase === 'center'
        ? tickEvents
        : [
            {
              id: `ScrollVelocityChanged_${sessionIndex}`,
              sessionId,
              pageId: `episode-page-${sessionIndex}`,
              kind: 'ScrollVelocityChanged' as const,
              occurredAt: baseTime + 15_500,
              confidence: 'high' as const,
              value: {
                scrollDeltaPx: 100,
                scrollDirection: 1,
                scrollOffsetPx: 100,
                scrollableExtentPx: 10_000,
                elapsedMs: 500,
                scrollSpeedWordsPerMinute: 120,
              },
            },
            ...tickEvents,
            {
              id: `PageHidden_${sessionIndex}`,
              sessionId,
              pageId: `episode-page-${sessionIndex}`,
              kind: 'PageHidden' as const,
              occurredAt: baseTime + 31_000,
              confidence: 'medium' as const,
            },
          ];

      return {
        page: {
          pageId: `episode-page-${sessionIndex}`,
          domain: 'docs.example.com',
          titleHash: 'title',
          urlHash: 'url',
          language: 'en',
          totalWords: 300,
          metricModelVersion: 2,
          capturedAt: baseTime,
        },
        chunks,
        events,
      };
    };

    let expectedBaseWordsPerMinute = 120;
    for (let sessionIndex = 1; sessionIndex <= 3; sessionIndex += 1) {
      await recordReadingEventBatch(createEpisodePayload(sessionIndex, 'center'));
      expect(episodes.size).toBe(1);
      await recordReadingEventBatch(createEpisodePayload(sessionIndex, 'complete'));
      expect(episodes.size).toBe(0);
      expectedBaseWordsPerMinute += (240 - expectedBaseWordsPerMinute) * 0.08;
      expect(profiles.get('en:general')).toEqual(expect.objectContaining({
        baseWordsPerMinute: expect.closeTo(expectedBaseWordsPerMinute, 6),
        adaptiveSampleCount: sessionIndex,
        source: 'adaptive',
      }));
    }
  });

  it('continues with a new episode after a boundary in the same batch', async () => {
    const payload = createAdaptiveEpisodeSeedPayload();
    const resumedTick = payload.events[0];
    const existingEpisode: ReadingPaceEpisodeRecord = {
      id: 'session-1:page-1',
      sessionId: 'session-1',
      pageId: 'page-1',
      language: 'en',
      startedAt: capturedAt - 30_000,
      lastObservedAt: capturedAt + 1_000,
      activeMs: 30_000,
      completedWords: 120,
      completedSegmentIds: Array.from({ length: 6 }, (_, index) => `completed-${index + 1}`),
      segmentStates: {},
      lastScrollDirection: 1,
      maxScrollOffsetPx: 500,
    };
    mocks.readingPaceProfiles.get.mockResolvedValue({
      id: 'en:general',
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 120,
      adaptiveSampleCount: 0,
      source: 'onboarding',
      updatedAt: capturedAt - 60_000,
    });
    mocks.readingPaceEpisodes.get.mockResolvedValue(existingEpisode);
    payload.events = [
      {
        id: 'UserIdle_same-batch',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'UserIdle',
        occurredAt: capturedAt + 2_000,
        confidence: 'medium',
        value: { idleMs: 45_000 },
      },
      {
        id: 'UserActive_same-batch',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'UserActive',
        occurredAt: capturedAt + 2_100,
        confidence: 'medium',
        value: { idleMs: 100 },
      },
      {
        ...resumedTick,
        id: 'TextViewportExposureTick_same-batch',
        occurredAt: capturedAt + 3_100,
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.readingPaceProfiles.put).toHaveBeenCalledWith(
      expect.objectContaining({
        baseWordsPerMinute: expect.closeTo(129.6, 6),
        adaptiveSampleCount: 1,
        source: 'adaptive',
      }),
    );
    expect(mocks.readingPaceEpisodes.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-1:page-1',
        startedAt: capturedAt + 3_100,
        activeMs: 1_000,
        completedWords: 0,
        completedSegmentIds: [],
        lastScrollDirection: 0,
      }),
    );
  });

  it('applies multiple qualified episodes from one batch in order', async () => {
    const sessionId = 'session_multi-episode';
    const pageId = 'page_multi-episode';
    const chunks = Array.from({ length: 15 }, (_, index) => ({
      chunkId: `multi-episode-chunk-${index + 1}`,
      pageId,
      textHash: `multi-episode-text-${index + 1}`,
      text: `Adaptive reading segment ${index + 1} provides stable ordinary prose for a sequential sample.`,
      wordCount: 20,
      sentenceCount: 1,
      selector: `p::chunk(${index + 1})`,
    }));
    const visibleChunks = (viewportY: number) => chunks.slice(0, 6).map((chunk) => ({
      chunkId: chunk.chunkId,
      wordCount: chunk.wordCount,
      visibleRatio: 1,
      centerDistance: Math.abs(viewportY - 0.5),
      viewportY,
      attentionMass: chunk.wordCount,
      contentMultiplier: 1,
      contentWeight: 1,
    }));
    const existingEpisode: ReadingPaceEpisodeRecord = {
      id: `${sessionId}:${pageId}`,
      sessionId,
      pageId,
      language: 'en',
      startedAt: capturedAt - 30_000,
      lastObservedAt: capturedAt,
      activeMs: 30_000,
      completedWords: 120,
      completedSegmentIds: Array.from({ length: 6 }, (_, index) => `prior-completed-${index + 1}`),
      segmentStates: {},
      lastScrollDirection: 1,
    };
    mocks.readingPaceProfiles.get.mockResolvedValue({
      id: 'en:general',
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 120,
      adaptiveSampleCount: 0,
      source: 'onboarding',
      updatedAt: capturedAt - 60_000,
    });
    mocks.readingPaceEpisodes.get.mockResolvedValue(existingEpisode);

    await recordReadingEventBatch({
      page: {
        pageId,
        domain: 'docs.example.com',
        titleHash: 'title',
        urlHash: 'url',
        language: 'en',
        totalWords: 300,
        metricModelVersion: 2,
        capturedAt,
      },
      chunks,
      events: [
        {
          id: 'UserIdle_multi-episode',
          sessionId,
          pageId,
          kind: 'UserIdle',
          occurredAt: capturedAt + 1_000,
          confidence: 'medium',
          value: { idleMs: 45_000 },
        },
        {
          id: 'TextViewportExposureTick_multi-center',
          sessionId,
          pageId,
          kind: 'TextViewportExposureTick',
          occurredAt: capturedAt + 31_000,
          confidence: 'high',
          value: {
            tickMs: 30_000,
            baseWordsPerMinute: 120,
            activeTab: true,
            documentVisible: true,
            scrollSpeedWordsPerMinute: 0,
            scrollDirection: 0,
            idleAgeMs: 0,
            visibleChunks: visibleChunks(0.5),
          },
        },
        {
          id: 'ScrollVelocityChanged_multi-forward',
          sessionId,
          pageId,
          kind: 'ScrollVelocityChanged',
          occurredAt: capturedAt + 31_500,
          confidence: 'high',
          value: {
            scrollDeltaPx: 100,
            scrollDirection: 1,
            scrollOffsetPx: 100,
            scrollableExtentPx: 10_000,
            elapsedMs: 500,
            scrollSpeedWordsPerMinute: 120,
          },
        },
        {
          id: 'TextViewportExposureTick_multi-complete',
          sessionId,
          pageId,
          kind: 'TextViewportExposureTick',
          occurredAt: capturedAt + 32_000,
          confidence: 'high',
          value: {
            tickMs: 1,
            baseWordsPerMinute: 120,
            activeTab: true,
            documentVisible: true,
            scrollSpeedWordsPerMinute: 120,
            scrollDirection: 1,
            idleAgeMs: 0,
            visibleChunks: visibleChunks(0.1),
          },
        },
        {
          id: 'PageHidden_multi-episode',
          sessionId,
          pageId,
          kind: 'PageHidden',
          occurredAt: capturedAt + 33_000,
          confidence: 'medium',
        },
      ],
    });

    const firstUpdatedWordsPerMinute = 120 + (240 - 120) * 0.08;
    const secondObservedWordsPerMinute = 120 * 60_000 / 30_001;
    const secondConfidence = (0.5 + 1 + 30_001 / 60_000) / 3;
    const expectedWordsPerMinute = firstUpdatedWordsPerMinute
      + (secondObservedWordsPerMinute - firstUpdatedWordsPerMinute) * 0.12 * secondConfidence;
    expect(mocks.readingPaceProfiles.put).toHaveBeenCalledWith(
      expect.objectContaining({
        baseWordsPerMinute: expect.closeTo(expectedWordsPerMinute, 6),
        adaptiveSampleCount: 2,
        source: 'adaptive',
      }),
    );
    expect(mocks.readingPaceEpisodes.delete).toHaveBeenCalledWith(`${sessionId}:${pageId}`);
  });

  it('keeps a forward burst below the fast-jump threshold', async () => {
    const payload = createAdaptiveEpisodeSeedPayload();

    await recordReadingEventBatch(payload);
    const episode = mocks.readingPaceEpisodes.put.mock.calls.at(-1)?.[0];

    mocks.readingPaceEpisodes.get.mockResolvedValue(episode);
    mocks.readingPaceEpisodes.delete.mockClear();
    mocks.readingPaceEpisodes.put.mockClear();
    payload.events = [
      {
        id: 'ScrollVelocityChanged_normal-burst',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'ScrollVelocityChanged',
        occurredAt: capturedAt + 2_000,
        confidence: 'medium',
        value: {
          scrollDeltaPx: 300,
          scrollDirection: 1,
          scrollOffsetPx: 300,
          scrollableExtentPx: 10_000,
          elapsedMs: 500,
          scrollSpeedWordsPerMinute: 600,
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.readingPaceEpisodes.delete).not.toHaveBeenCalled();
    expect(mocks.readingPaceEpisodes.put).toHaveBeenCalledWith(
      expect.objectContaining({
        maxScrollOffsetPx: 300,
      }),
    );
  });

  it('resets furthest scroll progress when the coordinate space changes', async () => {
    const payload = createAdaptiveEpisodeSeedPayload();

    await recordReadingEventBatch(payload);
    const episode = {
      ...mocks.readingPaceEpisodes.put.mock.calls.at(-1)?.[0],
      maxScrollOffsetPx: 500,
      lastScrollDirection: 1,
    };

    mocks.readingPaceEpisodes.get.mockResolvedValue(episode);
    mocks.readingPaceEpisodes.delete.mockClear();
    mocks.readingPaceEpisodes.put.mockClear();
    payload.events = [
      {
        id: 'ScrollCoordinatesReset_layout-change',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'ScrollCoordinatesReset',
        occurredAt: capturedAt + 2_000,
        confidence: 'medium',
      },
      {
        id: 'ScrollVelocityChanged_after-layout-change',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'ScrollVelocityChanged',
        occurredAt: capturedAt + 3_000,
        confidence: 'medium',
        value: {
          scrollDeltaPx: 100,
          scrollDirection: 1,
          scrollOffsetPx: 300,
          scrollableExtentPx: 10_000,
          elapsedMs: 1_000,
          scrollSpeedWordsPerMinute: 600,
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.readingPaceEpisodes.delete).not.toHaveBeenCalled();
    expect(mocks.readingPaceEpisodes.put).toHaveBeenCalledWith(
      expect.objectContaining({
        activeMs: 1_000,
        maxScrollOffsetPx: 300,
        lastScrollDirection: 1,
      }),
    );
  });

  it('allows a small reverse correction and ends after retreat exceeds tolerance', async () => {
    const payload = createAdaptiveEpisodeSeedPayload();

    await recordReadingEventBatch(payload);
    const episode = mocks.readingPaceEpisodes.put.mock.calls.at(-1)?.[0];

    mocks.readingPaceEpisodes.get.mockResolvedValue(episode);
    mocks.readingPaceEpisodes.delete.mockClear();
    mocks.readingPaceEpisodes.put.mockClear();
    payload.events = [
      {
        id: 'ScrollVelocityChanged_small-reverse',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'ScrollVelocityChanged',
        occurredAt: capturedAt + 2_000,
        confidence: 'low',
        value: {
          scrollDeltaPx: 100,
          scrollDirection: -1,
          scrollOffsetPx: 400,
          scrollableExtentPx: 10_000,
          elapsedMs: 200,
          scrollSpeedWordsPerMinute: 2_000,
        },
      },
      {
        ...payload.events[0],
        id: 'TextViewportExposureTick_small-reverse',
        occurredAt: capturedAt + 3_000,
        value: {
          ...payload.events[0].value,
          scrollDirection: -1,
          scrollSpeedWordsPerMinute: 2_000,
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.readingPaceEpisodes.delete).not.toHaveBeenCalled();
    const correctedEpisode = mocks.readingPaceEpisodes.put.mock.calls.at(-1)?.[0];
    expect(correctedEpisode).toEqual(expect.objectContaining({
      lastScrollDirection: -1,
      maxScrollOffsetPx: 500,
    }));

    mocks.readingPaceEpisodes.get.mockResolvedValue(correctedEpisode);
    mocks.readingPaceEpisodes.delete.mockClear();
    payload.events = [
      {
        id: 'ScrollVelocityChanged_large-reverse',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'ScrollVelocityChanged',
        occurredAt: capturedAt + 4_000,
        confidence: 'low',
        value: {
          scrollDeltaPx: 100,
          scrollDirection: -1,
          scrollOffsetPx: 300,
          scrollableExtentPx: 10_000,
          elapsedMs: 200,
          scrollSpeedWordsPerMinute: 2_000,
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.readingPaceEpisodes.delete).toHaveBeenCalledWith('session-1:page-1');
  });

  it('ends a persisted calibration episode on a fast forward jump', async () => {
    const payload = createAdaptiveEpisodeSeedPayload();

    await recordReadingEventBatch(payload);
    const episode = mocks.readingPaceEpisodes.put.mock.calls.at(-1)?.[0];
    expect(episode).toEqual(expect.objectContaining({ activeMs: 1_000 }));

    mocks.readingPaceEpisodes.get.mockResolvedValue(episode);
    mocks.readingPaceEpisodes.delete.mockClear();
    payload.events = [
      {
        id: 'ScrollVelocityChanged_fast-jump',
        sessionId: 'session-1',
        pageId: 'page-1',
        kind: 'ScrollVelocityChanged',
        occurredAt: capturedAt + 2_000,
        confidence: 'low',
        value: {
          scrollDeltaPx: 900,
          scrollDirection: 1,
          scrollOffsetPx: 900,
          scrollableExtentPx: 10_000,
          elapsedMs: 200,
          scrollSpeedWordsPerMinute: 1_200,
        },
      },
    ];

    await recordReadingEventBatch(payload);

    expect(mocks.readingPaceEpisodes.delete).toHaveBeenCalledWith('session-1:page-1');
  });

  it('does not aggregate duplicate reading events that are already stored locally', async () => {
    const payload = createPayload();
    mocks.readingEvents.bulkGet.mockResolvedValueOnce([payload.events[0]]);

    await recordReadingEventBatch(payload);

    expect(mocks.readingEvents.bulkGet).toHaveBeenCalledWith(['TextViewportExposureTick_event-1']);
    expect(mocks.pages.put).not.toHaveBeenCalled();
    expect(mocks.textChunks.bulkPut).not.toHaveBeenCalled();
    expect(mocks.readingEvents.bulkPut).not.toHaveBeenCalled();
    expect(mocks.dailyStats.put).not.toHaveBeenCalled();
    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
  });

  it('discards buffered events captured before local data was cleared', async () => {
    mocks.metadata.get.mockResolvedValueOnce({
      key: 'readingDataClearedAt',
      numberValue: capturedAt + 1,
    });

    await recordReadingEventBatch(createPayload());

    expect(mocks.pages.put).not.toHaveBeenCalled();
    expect(mocks.textChunks.bulkPut).not.toHaveBeenCalled();
    expect(mocks.readingEvents.bulkPut).not.toHaveBeenCalled();
    expect(mocks.dailyStats.put).not.toHaveBeenCalled();
    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
  });

  it('aggregates only events captured after the latest local data clear', async () => {
    const payload = createPayload();
    payload.events = [
      payload.events[0],
      {
        ...payload.events[0],
        id: 'TextViewportExposureTick_event-2',
        occurredAt: capturedAt + 2_000,
      },
    ];
    mocks.metadata.get.mockResolvedValueOnce({
      key: 'readingDataClearedAt',
      numberValue: capturedAt + 1_000,
    });

    await recordReadingEventBatch(payload);

    expect(mocks.readingEvents.bulkGet).toHaveBeenCalledWith(['TextViewportExposureTick_event-2']);
    expect(mocks.readingEvents.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'TextViewportExposureTick_event-2' }),
    ]);
    expect(mocks.dailyStats.put).toHaveBeenCalledOnce();
  });

  it('clips a viewport interval that began before local data was cleared', async () => {
    const payload = createPayload();
    payload.events = [{
      ...payload.events[0],
      occurredAt: capturedAt + 30_000,
    }];
    mocks.metadata.get.mockResolvedValueOnce({
      key: 'readingDataClearedAt',
      numberValue: capturedAt + 20_000,
    });

    await recordReadingEventBatch(payload);

    expect(mocks.readingEvents.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({
        value: expect.objectContaining({ tickMs: 10_000 }),
      }),
    ]);
    expect(mocks.pages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        rawExposureMs: 10_000,
        firstSeenAt: capturedAt + 20_000,
      }),
    );
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

  it('prunes abandoned reading pace episodes after the retention window', async () => {
    const deleteOldEpisodes = vi.fn();
    const belowRetentionCutoff = vi.fn(() => ({
      delete: deleteOldEpisodes,
    }));
    mocks.readingPaceEpisodes.where.mockReturnValue({
      below: belowRetentionCutoff,
    });

    await pruneExpiredReadingPaceEpisodes(capturedAt + 120_000);

    expect(mocks.readingPaceEpisodes.where).toHaveBeenCalledWith('lastObservedAt');
    expect(belowRetentionCutoff).toHaveBeenCalledWith(capturedAt + 120_000 - 24 * 60 * 60 * 1_000);
    expect(deleteOldEpisodes).toHaveBeenCalledOnce();
  });

  it('clears local reading data tables and records the event cutoff without touching extension settings', async () => {
    await clearLocalReadingData(capturedAt);

    expect(mocks.pages.clear).toHaveBeenCalledOnce();
    expect(mocks.textChunks.clear).toHaveBeenCalledOnce();
    expect(mocks.chunkSessions.clear).toHaveBeenCalledOnce();
    expect(mocks.chunkDays.clear).toHaveBeenCalledOnce();
    expect(mocks.readingEvents.clear).toHaveBeenCalledOnce();
    expect(mocks.readingSessions.clear).toHaveBeenCalledOnce();
    expect(mocks.vocabExposures.clear).toHaveBeenCalledOnce();
    expect(mocks.savedItems.clear).toHaveBeenCalledOnce();
    expect(mocks.pdfAnnotations.clear).toHaveBeenCalledOnce();
    expect(mocks.pdfDocumentStates.clear).toHaveBeenCalledOnce();
    expect(mocks.dailyStats.clear).toHaveBeenCalledOnce();
    expect(mocks.readingPaceProfiles.clear).toHaveBeenCalledOnce();
    expect(mocks.readingPaceEpisodes.clear).toHaveBeenCalledOnce();
    expect(mocks.metadata.put).toHaveBeenCalledWith({
      key: 'readingDataClearedAt',
      numberValue: capturedAt,
    });
  });

  it('keeps the local data clear cutoff monotonic when the clock moves backward', async () => {
    const existingClearedAt = capturedAt + 60_000;
    mocks.metadata.get.mockResolvedValueOnce({
      key: 'readingDataClearedAt',
      numberValue: existingClearedAt,
    });

    await clearLocalReadingData(capturedAt);

    expect(mocks.metadata.get).toHaveBeenCalledWith('readingDataClearedAt');
    expect(mocks.metadata.put).toHaveBeenCalledWith({
      key: 'readingDataClearedAt',
      numberValue: existingClearedAt,
    });
  });
});
