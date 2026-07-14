import { describe, expect, it } from 'vitest';

import { createPageId } from '../domain/events';
import {
  getCurrentPageReadingSummary,
  getPageReadingSummary,
  getReadingDashboardDetails,
  getSidePanelReadingDetails,
  getTodayReadingSummary,
  type ReadingStatsStore,
} from './readingStats';
import type {
  DailyStatRecord,
  PageRecord,
  PdfAnnotationRecord,
  ReadingSessionRecord,
  SavedItemRecord,
  VocabExposureRecord,
} from './schema';

const morningOnJune27 = new Date(2026, 5, 27, 10, 0, 0).getTime();

function createStore({
  dailyStat,
  todayPages = [],
  learningWords = 0,
  expectedRecentPageQueryLimit = 20,
  expectedRecentVocabularyQueryLimit = 20,
  expectedRecentSavedItemQueryLimit = 20,
  recentPages = [],
  readingSessions = [],
  recentVocabulary = [],
  recentSavedItems = [],
  pdfAnnotations = new Map<string, PdfAnnotationRecord>(),
  pagesById = new Map<string, PageRecord>(),
  historicalDailyStats = new Map<string, ReturnType<typeof createDailyStat>>(),
  checkInThresholdWords,
}: {
  dailyStat?: {
    effectiveWords: number;
    minutes: number;
    streak: number;
    topDomains: string[];
    checkInThresholdWords?: number;
  };
  todayPages?: PageRecord[];
  learningWords?: number;
  expectedRecentPageQueryLimit?: number;
  expectedRecentVocabularyQueryLimit?: number;
  expectedRecentSavedItemQueryLimit?: number;
  recentPages?: PageRecord[];
  readingSessions?: ReadingSessionRecord[];
  recentVocabulary?: VocabExposureRecord[];
  recentSavedItems?: SavedItemRecord[];
  pdfAnnotations?: Map<string, PdfAnnotationRecord>;
  pagesById?: Map<string, PageRecord>;
  historicalDailyStats?: Map<string, ReturnType<typeof createDailyStat>>;
  checkInThresholdWords?: number;
}): ReadingStatsStore {
  const getDailyStat = (date: string) => {
    if (date === '2026-06-27') {
      return dailyStat ? { date, ...dailyStat } : historicalDailyStats.get(date);
    }
    return historicalDailyStats.get(date);
  };

  return {
    metadata: {
      async get(key: string) {
        expect(key).toBe('dailyCheckInThresholdWords');
        return checkInThresholdWords === undefined
          ? undefined
          : { key, numberValue: checkInThresholdWords };
      },
    },
    dailyStats: {
      async get(date: string) {
        return getDailyStat(date);
      },
      async bulkGet(dates: string[]) {
        return dates.map(getDailyStat);
      },
    },
    readingSessions: {
      where(index: string) {
        expect(index).toBe('endedAt');
        return {
          aboveOrEqual(startedAt: number) {
            expect(startedAt).toBe(new Date(2026, 2, 30).getTime());
            return {
              async toArray() {
                return readingSessions;
              },
            };
          },
        };
      },
    },
    pages: {
      async get(pageId: string) {
        return pagesById.get(pageId);
      },
      where(index: string) {
        expect(index).toBe('lastReadAt');
        return {
          aboveOrEqual(startOfDay: number) {
            expect(startOfDay).toBe(new Date(2026, 5, 27).getTime());
            return {
              async count() {
                return todayPages.length;
              },
              async toArray() {
                return todayPages;
              },
            };
          },
        };
      },
      orderBy(index: string) {
        expect(index).toBe('lastReadAt');
        return {
          reverse() {
            return {
              limit(count: number) {
                expect(count).toBe(expectedRecentPageQueryLimit);
                return {
                  async toArray() {
                    return recentPages.slice(0, count);
                  },
                };
              },
            };
          },
        };
      },
    },
    vocabExposures: {
      where(index: string) {
        expect(index).toBe('userStatus');
        return {
          equals(status: string) {
            expect(status).toBe('learning');
            return {
              async count() {
                return learningWords;
              },
            };
          },
        };
      },
      orderBy(index: string) {
        expect(index).toBe('lastSeenAt');
        return {
          reverse() {
            return {
              limit(count: number) {
                expect(count).toBe(expectedRecentVocabularyQueryLimit);
                return {
                  async toArray() {
                    return recentVocabulary;
                  },
                };
              },
            };
          },
        };
      },
    },
    savedItems: {
      orderBy(index: string) {
        expect(index).toBe('createdAt');
        return {
          reverse() {
            return {
              limit(count: number) {
                expect(count).toBe(expectedRecentSavedItemQueryLimit);
                return {
                  async toArray() {
                    return recentSavedItems.slice(0, count);
                  },
                };
              },
            };
          },
        };
      },
    },
    pdfAnnotations: {
      async bulkGet(ids: string[]) {
        return ids.map((id) => pdfAnnotations.get(id));
      },
    },
  };
}

describe('getTodayReadingSummary', () => {
  it('loads today reading totals from local storage tables', async () => {
    const summary = await getTodayReadingSummary(
      createStore({
        dailyStat: {
          effectiveWords: 842,
          minutes: 12.5,
          streak: 3,
          checkInThresholdWords: 500,
          topDomains: ['developer.mozilla.org', 'github.com'],
        },
        todayPages: [
          createPageRecord({ pageId: 'page-1', effectiveWords: 120 }),
          createPageRecord({ pageId: 'page-2', effectiveWords: 220 }),
          createPageRecord({ pageId: 'page-3', effectiveWords: 180 }),
          createPageRecord({ pageId: 'page-4', effectiveWords: 320 }),
        ],
        learningWords: 11,
      }),
      morningOnJune27,
    );

    expect(summary).toEqual({
      date: '2026-06-27',
      effectiveWords: 842,
      minutes: 12.5,
      streak: 3,
      checkInThresholdWords: 500,
      checkInCompleted: true,
      topDomains: ['developer.mozilla.org', 'github.com'],
      readPages: 4,
      learningWords: 11,
      hasData: true,
    });
  });

  it('does not count opened pages without measured reading as today reading data', async () => {
    const summary = await getTodayReadingSummary(
      createStore({
        todayPages: [createPageRecord({ pageId: 'opened-only-page', effectiveWords: 0 })],
      }),
      morningOnJune27,
    );

    expect(summary.readPages).toBe(0);
    expect(summary.hasData).toBe(false);
  });

  it('returns an empty summary when the local database has no reading data for today', async () => {
    const summary = await getTodayReadingSummary(createStore({}), morningOnJune27);

    expect(summary).toEqual({
      date: '2026-06-27',
      effectiveWords: 0,
      minutes: 0,
      streak: 0,
      checkInThresholdWords: 500,
      checkInCompleted: false,
      topDomains: [],
      readPages: 0,
      learningWords: 0,
      hasData: false,
    });
  });

  it('normalizes stored top domains before exposing reading summaries', async () => {
    const summary = await getTodayReadingSummary(
      createStore({
        dailyStat: {
          effectiveWords: 842,
          minutes: 12.5,
          streak: 3,
          topDomains: ['  developer.mozilla.org  ', '', 'github.com', 'developer.mozilla.org', '   '],
        },
      }),
      morningOnJune27,
    );

    expect(summary.topDomains).toEqual(['developer.mozilla.org', 'github.com']);
  });

  it('recovers legacy consecutive-day streaks against the active threshold', async () => {
    const store = createStore({
        dailyStat: {
          effectiveWords: 600,
          minutes: 1,
          streak: 0,
          topDomains: [],
        },
        historicalDailyStats: new Map([
          ['2026-06-26', createDailyStat('2026-06-26', { effectiveWords: 700 })],
          ['2026-06-25', createDailyStat('2026-06-25', { effectiveWords: 800 })],
        ]),
      });
    const getDailyStat = vi.spyOn(store.dailyStats, 'get');

    const summary = await getTodayReadingSummary(store, morningOnJune27);
    const repeatedSummary = await getTodayReadingSummary(store, morningOnJune27);

    expect(summary.streak).toBe(3);
    expect(repeatedSummary.streak).toBe(3);
    expect(getDailyStat.mock.calls.filter(([date]) => date === '2026-06-26')).toHaveLength(2);
  });

  it('does not complete a check-in until the user threshold is reached', async () => {
    const summary = await getTodayReadingSummary(
      createStore({
        checkInThresholdWords: 1_000,
        dailyStat: {
          effectiveWords: 999,
          minutes: 4,
          streak: 18,
          checkInThresholdWords: 1_000,
          topDomains: ['docs.example.com'],
        },
      }),
      morningOnJune27,
    );

    expect(summary.checkInThresholdWords).toBe(1_000);
    expect(summary.checkInCompleted).toBe(false);
    expect(summary.streak).toBe(0);
  });
});

describe('getReadingDashboardDetails', () => {
  it('loads a Monday-aligned thirteen-week history for dashboard visualizations', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        historicalDailyStats: new Map([
          [
            '2026-06-25',
            createDailyStat('2026-06-25', {
              effectiveWords: 750,
              minutes: 9.5,
              newWords: 520,
              reviewWords: 230,
              topDomains: [' docs.example.com ', 'docs.example.com'],
            }),
          ],
        ]),
      }),
      morningOnJune27,
    );

    expect(details.history).toHaveLength(90);
    expect(details.history?.[0]?.date).toBe('2026-03-30');
    expect(details.history?.at(-1)?.date).toBe('2026-06-27');
    expect(details.history?.find((day) => day.date === '2026-06-25')).toEqual({
      date: '2026-06-25',
      effectiveWords: 750,
      minutes: 9.5,
      newWords: 520,
      reviewWords: 230,
      checkInCompleted: true,
    });
    expect(details.hasData).toBe(true);
  });

  it('loads today summary plus recent pages and vocabulary exposure details', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        dailyStat: {
          effectiveWords: 620,
          minutes: 8.25,
          streak: 2,
          topDomains: ['github.com'],
        },
        todayPages: [
          createPageRecord({ pageId: 'page-1', effectiveWords: 400 }),
          createPageRecord({ pageId: 'page-2', effectiveWords: 220 }),
        ],
        learningWords: 1,
        recentPages: [
          createPageRecord({ pageId: 'page-2', domain: 'github.com', totalWords: 400, effectiveWords: 220 }),
        ],
        recentVocabulary: [createVocabRecord({ lemma: 'resilience', effectiveSeenCount: 3, packTags: ['architecture'] })],
        recentSavedItems: [
          createSavedItemRecord({
            id: 'saved-1',
            text: 'fail gracefully under pressure',
            sourceDomain: 'developer.mozilla.org',
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.summary.effectiveWords).toBe(620);
    expect(details.recentPages).toEqual([
      {
        pageId: 'page-2',
        domain: 'github.com',
        totalWords: 400,
        effectiveWords: 220,
        coveredWords: 220,
        effectiveMinutes: 0,
        lastReadAt: morningOnJune27,
      },
    ]);
    expect(details.recentVocabulary).toEqual([
      {
        lemma: 'resilience',
        effectiveSeenCount: 3,
        savedCount: 0,
        packTags: ['architecture'],
        userStatus: 'learning',
      },
    ]);
    expect(details.recentSavedItems).toEqual([
      {
        id: 'saved-1',
        text: 'fail gracefully under pressure',
        type: 'phrase',
        sourceDomain: 'developer.mozilla.org',
        tags: ['selection'],
        createdAt: morningOnJune27,
      },
    ]);
    expect(details.hasData).toBe(true);
  });

  it('joins PDF saved items to precise source anchors for reader backlinks', async () => {
    const annotation = createPdfAnnotationRecord();
    const details = await getReadingDashboardDetails(
      createStore({
        recentSavedItems: [
          createSavedItemRecord({
            id: 'saved-pdf',
            sourceDomain: 'pdf.local',
            tags: ['selection', 'pdf'],
            pdfAnnotationId: annotation.id,
          }),
        ],
        pdfAnnotations: new Map([[annotation.id, annotation]]),
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems).toEqual([
      expect.objectContaining({
        id: 'saved-pdf',
        pdfAnchor: {
          annotationId: annotation.id,
          resourceId: annotation.resourceId,
          pageIndex: 2,
          pageCoordinates: {
            x: 72,
            y: 144,
          },
        },
      }),
    ]);
  });

  it('omits recent pages that have no measured reading exposure', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentPages: [
          createPageRecord({ pageId: 'opened-only-page', domain: 'example.com', effectiveWords: 0 }),
          createPageRecord({ pageId: 'read-page', domain: 'developer.mozilla.org', effectiveWords: 120 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentPages).toEqual([
      {
        pageId: 'read-page',
        domain: 'developer.mozilla.org',
        totalWords: 400,
        effectiveWords: 120,
        coveredWords: 120,
        effectiveMinutes: 0,
        lastReadAt: morningOnJune27,
      },
    ]);
  });

  it('normalizes blank recent page domains for dashboard display', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentPages: [
          createPageRecord({ pageId: 'read-page', domain: '   ', effectiveWords: 120 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentPages).toEqual([
      expect.objectContaining({
        pageId: 'read-page',
        domain: 'unknown',
      }),
    ]);
  });

  it('scans past recently opened-only pages to show recent measured reading history', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        expectedRecentPageQueryLimit: 20,
        recentPages: [
          createPageRecord({ pageId: 'opened-only-page-1', domain: 'example.com', effectiveWords: 0, lastReadAt: morningOnJune27 + 5_000 }),
          createPageRecord({ pageId: 'opened-only-page-2', domain: 'example.com', effectiveWords: 0, lastReadAt: morningOnJune27 + 4_000 }),
          createPageRecord({ pageId: 'opened-only-page-3', domain: 'example.com', effectiveWords: 0, lastReadAt: morningOnJune27 + 3_000 }),
          createPageRecord({ pageId: 'opened-only-page-4', domain: 'example.com', effectiveWords: 0, lastReadAt: morningOnJune27 + 2_000 }),
          createPageRecord({ pageId: 'opened-only-page-5', domain: 'example.com', effectiveWords: 0, lastReadAt: morningOnJune27 + 1_000 }),
          createPageRecord({ pageId: 'read-page', domain: 'developer.mozilla.org', effectiveWords: 120, lastReadAt: morningOnJune27 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentPages).toEqual([
      {
        pageId: 'read-page',
        domain: 'developer.mozilla.org',
        totalWords: 400,
        effectiveWords: 120,
        coveredWords: 120,
        effectiveMinutes: 0,
        lastReadAt: morningOnJune27,
      },
    ]);
  });

  it('merges nearby page records into focus sessions and keeps longer breaks separate', async () => {
    const firstStartedAt = new Date(2026, 5, 27, 9, 0).getTime();
    const details = await getReadingDashboardDetails(
      createStore({
        readingSessions: [
          createReadingSessionRecord({
            id: 'session-a',
            pageId: 'page-a',
            domain: 'docs.example.com',
            startedAt: firstStartedAt,
            endedAt: firstStartedAt + 10 * 60_000,
            effectiveReadingMs: 5 * 60_000,
            effectiveWords: 100,
          }),
          createReadingSessionRecord({
            id: 'session-b',
            pageId: 'page-b',
            domain: 'github.com',
            startedAt: firstStartedAt + 14 * 60_000,
            endedAt: firstStartedAt + 25 * 60_000,
            effectiveReadingMs: 7 * 60_000,
            effectiveWords: 140,
          }),
          createReadingSessionRecord({
            id: 'session-c',
            pageId: 'page-c',
            domain: 'pdf.local',
            resourceType: 'pdf',
            startedAt: firstStartedAt + 31 * 60_000,
            endedAt: firstStartedAt + 35 * 60_000,
            effectiveReadingMs: 3 * 60_000,
            effectiveWords: 60,
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.readingSessions).toEqual([
      {
        id: 'session-c',
        date: '2026-06-27',
        startedAt: firstStartedAt + 31 * 60_000,
        endedAt: firstStartedAt + 35 * 60_000,
        effectiveMinutes: 3,
        effectiveWords: 60,
        pageCount: 1,
        sources: [{
          domain: 'pdf.local',
          resourceType: 'pdf',
          effectiveMinutes: 3,
        }],
      },
      {
        id: 'session-a',
        date: '2026-06-27',
        startedAt: firstStartedAt,
        endedAt: firstStartedAt + 25 * 60_000,
        effectiveMinutes: 12,
        effectiveWords: 240,
        pageCount: 2,
        sources: [
          {
            domain: 'github.com',
            resourceType: undefined,
            effectiveMinutes: 7,
          },
          {
            domain: 'docs.example.com',
            resourceType: undefined,
            effectiveMinutes: 5,
          },
        ],
      },
    ]);
    expect(details.hasData).toBe(true);
  });

  it('limits dashboard recent pages to five measured reading records after scanning', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentPages: [
          createPageRecord({ pageId: 'read-page-1', domain: 'docs1.example.com', effectiveWords: 101, lastReadAt: morningOnJune27 + 5_000 }),
          createPageRecord({ pageId: 'read-page-2', domain: 'docs2.example.com', effectiveWords: 102, lastReadAt: morningOnJune27 + 4_000 }),
          createPageRecord({ pageId: 'read-page-3', domain: 'docs3.example.com', effectiveWords: 103, lastReadAt: morningOnJune27 + 3_000 }),
          createPageRecord({ pageId: 'read-page-4', domain: 'docs4.example.com', effectiveWords: 104, lastReadAt: morningOnJune27 + 2_000 }),
          createPageRecord({ pageId: 'read-page-5', domain: 'docs5.example.com', effectiveWords: 105, lastReadAt: morningOnJune27 + 1_000 }),
          createPageRecord({ pageId: 'read-page-6', domain: 'docs6.example.com', effectiveWords: 106, lastReadAt: morningOnJune27 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentPages.map((page) => page.pageId)).toEqual([
      'read-page-1',
      'read-page-2',
      'read-page-3',
      'read-page-4',
      'read-page-5',
    ]);
  });

  it('scans past ineffective vocabulary records to show recent effective vocabulary history', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentVocabulary: [
          createVocabRecord({ lemma: 'opened', seenCount: 3, effectiveSeenCount: 0, lastSeenAt: morningOnJune27 + 1_000 }),
          createVocabRecord({ lemma: 'resilience', seenCount: 4, effectiveSeenCount: 2, lastSeenAt: morningOnJune27 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentVocabulary.map((vocab) => vocab.lemma)).toEqual(['resilience']);
    expect(details.hasData).toBe(true);
  });

  it('does not treat ineffective vocabulary-only history as dashboard data', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentVocabulary: [
          createVocabRecord({ lemma: 'opened', seenCount: 3, effectiveSeenCount: 0 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentVocabulary).toEqual([]);
    expect(details.hasData).toBe(false);
  });

  it('omits ignored vocabulary memories from dashboard data', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentVocabulary: [
          createVocabRecord({
            lemma: 'dismissed',
            effectiveSeenCount: 4,
            savedCount: 1,
            userStatus: 'ignored',
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentVocabulary).toEqual([]);
    expect(details.hasData).toBe(false);
  });

  it('shows saved-only vocabulary memory as dashboard data', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentVocabulary: [
          createVocabRecord({
            lemma: 'resilience',
            seenCount: 0,
            effectiveSeenCount: 0,
            savedCount: 2,
            userStatus: 'learning',
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentVocabulary).toEqual([
      {
        lemma: 'resilience',
        effectiveSeenCount: 0,
        savedCount: 2,
        packTags: ['architecture'],
        userStatus: 'learning',
      },
    ]);
    expect(details.hasData).toBe(true);
  });

  it('does not treat blank vocabulary lemmas as dashboard data', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentVocabulary: [
          createVocabRecord({
            lemma: '   ',
            effectiveSeenCount: 3,
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentVocabulary).toEqual([]);
    expect(details.hasData).toBe(false);
  });

  it('normalizes vocabulary lemmas before dashboard display', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentVocabulary: [
          createVocabRecord({
            lemma: '  resilience  ',
            effectiveSeenCount: 3,
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentVocabulary).toEqual([
      expect.objectContaining({
        lemma: 'resilience',
      }),
    ]);
  });

  it('normalizes vocabulary pack tags before dashboard display', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentVocabulary: [
          createVocabRecord({
            lemma: 'resilience',
            packTags: [' architecture ', '', 'architecture', '  performance  ', '   '],
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentVocabulary).toEqual([
      expect.objectContaining({
        lemma: 'resilience',
        packTags: ['architecture', 'performance'],
      }),
    ]);
  });

  it('loads recent saved selections as dashboard data', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentSavedItems: [
          createSavedItemRecord({
            id: 'saved-new',
            text: 'mitigate memory overhead',
            sourceDomain: 'github.com',
            createdAt: morningOnJune27 + 2_000,
          }),
          createSavedItemRecord({
            id: 'saved-old',
            text: 'resilience',
            type: 'word',
            sourceDomain: 'developer.mozilla.org',
            createdAt: morningOnJune27,
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems.map((item) => item.id)).toEqual(['saved-new', 'saved-old']);
    expect(details.hasData).toBe(true);
  });

  it('does not treat blank saved selections as dashboard data', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentSavedItems: [
          createSavedItemRecord({
            id: 'saved-blank-text',
            text: '   ',
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems).toEqual([]);
    expect(details.hasData).toBe(false);
  });

  it('scans past blank saved selections to show recent saved history', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        expectedRecentSavedItemQueryLimit: 20,
        recentSavedItems: [
          createSavedItemRecord({ id: 'blank-1', text: '   ', createdAt: morningOnJune27 + 5_000 }),
          createSavedItemRecord({ id: 'blank-2', text: '\n\t', createdAt: morningOnJune27 + 4_000 }),
          createSavedItemRecord({ id: 'blank-3', text: ' ', createdAt: morningOnJune27 + 3_000 }),
          createSavedItemRecord({ id: 'blank-4', text: '  ', createdAt: morningOnJune27 + 2_000 }),
          createSavedItemRecord({ id: 'blank-5', text: '', createdAt: morningOnJune27 + 1_000 }),
          createSavedItemRecord({ id: 'saved-visible', text: 'mitigate memory overhead', createdAt: morningOnJune27 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems.map((item) => item.id)).toEqual(['saved-visible']);
    expect(details.hasData).toBe(true);
  });

  it('limits dashboard recent saved selections to five visible records after scanning', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        expectedRecentSavedItemQueryLimit: 20,
        recentSavedItems: [
          createSavedItemRecord({ id: 'saved-1', createdAt: morningOnJune27 + 5_000 }),
          createSavedItemRecord({ id: 'saved-2', createdAt: morningOnJune27 + 4_000 }),
          createSavedItemRecord({ id: 'saved-3', createdAt: morningOnJune27 + 3_000 }),
          createSavedItemRecord({ id: 'saved-4', createdAt: morningOnJune27 + 2_000 }),
          createSavedItemRecord({ id: 'saved-5', createdAt: morningOnJune27 + 1_000 }),
          createSavedItemRecord({ id: 'saved-6', createdAt: morningOnJune27 }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems.map((item) => item.id)).toEqual([
      'saved-1',
      'saved-2',
      'saved-3',
      'saved-4',
      'saved-5',
    ]);
  });

  it('normalizes saved selection text before dashboard display', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentSavedItems: [
          createSavedItemRecord({
            id: 'saved-spaced-text',
            text: '  mitigate\n\nmemory\t\t overhead  ',
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems).toEqual([
      expect.objectContaining({
        id: 'saved-spaced-text',
        text: 'mitigate memory overhead',
      }),
    ]);
  });

  it('normalizes saved selection tags before dashboard display', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentSavedItems: [
          createSavedItemRecord({
            id: 'saved-spaced-tags',
            tags: [' selection ', '', 'selection', '  quote  ', '   '],
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems).toEqual([
      expect.objectContaining({
        id: 'saved-spaced-tags',
        tags: ['selection', 'quote'],
      }),
    ]);
  });

  it('normalizes blank saved selection source domains for dashboard display', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        recentSavedItems: [
          createSavedItemRecord({
            id: 'saved-blank-source',
            sourceDomain: '   ',
          }),
        ],
      }),
      morningOnJune27,
    );

    expect(details.recentSavedItems).toEqual([
      expect.objectContaining({
        id: 'saved-blank-source',
        sourceDomain: 'unknown',
      }),
    ]);
    expect(details.hasData).toBe(true);
  });

  it('returns an empty dashboard model when no local reading data exists', async () => {
    const details = await getReadingDashboardDetails(createStore({}), morningOnJune27);

    expect(details.hasData).toBe(false);
  });
});

describe('getSidePanelReadingDetails', () => {
  it('loads only the summary, vocabulary, and saved-item collections used by the side panel', async () => {
    const store = createStore({
      dailyStat: {
        effectiveWords: 320,
        minutes: 4,
        streak: 2,
        topDomains: ['docs.example.com'],
      },
      recentVocabulary: [createVocabRecord({ lemma: 'resilience', effectiveSeenCount: 2 })],
      recentSavedItems: [createSavedItemRecord({ text: 'fail gracefully' })],
    });
    store.pages.orderBy = () => {
      throw new Error('side-panel query must not load recent pages');
    };

    const details = await getSidePanelReadingDetails(store, morningOnJune27);

    expect(details.summary.effectiveWords).toBe(320);
    expect(details.recentVocabulary[0]?.lemma).toBe('resilience');
    expect(details.recentSavedItems[0]?.text).toBe('fail gracefully');
  });
});

describe('getCurrentPageReadingSummary', () => {
  it('loads measured progress for the current tab page without exposing raw URL data', async () => {
    const summary = await getCurrentPageReadingSummary(
      'https://developer.mozilla.org/en-US/docs/Web/API#reading',
      createStore({
        pagesById: new Map([
          [
            'developer.mozilla.org_yfw3uh',
            createPageRecord({
              pageId: 'developer.mozilla.org_yfw3uh',
              domain: 'developer.mozilla.org',
              totalWords: 1200,
              effectiveWords: 420,
              effectiveReadingMs: 180_000,
              confidence: 0.82,
            }),
          ],
        ]),
      }),
    );

    expect(summary).toEqual({
      totalWords: 1200,
      effectiveWords: 420,
      coveredWords: 420,
      effectiveMinutes: 3,
      confidence: 0.82,
      hasData: true,
    });
  });

  it('separates cumulative effective input from unique page-content coverage', async () => {
    const url = 'https://docs.example.com/revisited';
    const pageId = createPageId(url);
    const summary = await getCurrentPageReadingSummary(
      url,
      createStore({
        pagesById: new Map([
          [
            pageId,
            createPageRecord({
              pageId,
              domain: 'docs.example.com',
              totalWords: 400,
              effectiveWords: 900,
              coveredWords: 250,
            }),
          ],
        ]),
      }),
    );

    expect(summary.effectiveWords).toBe(900);
    expect(summary.coveredWords).toBe(250);
  });

  it('returns a current-page empty state when the page has not produced local reading data', async () => {
    const summary = await getCurrentPageReadingSummary('https://docs.example.com/guide', createStore({}));

    expect(summary).toEqual({
      totalWords: 0,
      effectiveWords: 0,
      coveredWords: 0,
      effectiveMinutes: 0,
      hasData: false,
    });
  });

  it('loads resource-backed PDF progress directly by its stable page ID', async () => {
    const pageId = 'pdf.local_1oh4h4p';
    const pdfResourceId = `pdf_${'a'.repeat(64)}`;
    const summary = await getPageReadingSummary(
      pageId,
      createStore({
        pagesById: new Map([
          [
            pageId,
            createPageRecord({
              pageId,
              domain: 'pdf.local',
              resourceType: 'pdf',
              resourceId: pdfResourceId,
              totalWords: 2_400,
              effectiveWords: 640,
              coveredWords: 520,
              effectiveReadingMs: 240_000,
            }),
          ],
        ]),
      }),
    );

    expect(summary).toEqual({
      totalWords: 2_400,
      effectiveWords: 640,
      coveredWords: 520,
      effectiveMinutes: 4,
      confidence: undefined,
      hasData: true,
    });
  });
});

function createPageRecord(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    pageId: 'page-1',
    domain: 'example.com',
    titleHash: 'title',
    urlHash: 'url',
    language: 'en',
    totalWords: 400,
    effectiveWords: 0,
    firstSeenAt: morningOnJune27 - 2_000,
    lastReadAt: morningOnJune27,
    ...overrides,
  };
}

function createReadingSessionRecord(
  overrides: Partial<ReadingSessionRecord> = {},
): ReadingSessionRecord {
  return {
    id: 'session-record',
    sessionId: 'technical-session',
    date: '2026-06-27',
    pageId: 'page-1',
    domain: 'example.com',
    startedAt: morningOnJune27,
    endedAt: morningOnJune27 + 60_000,
    effectiveReadingMs: 60_000,
    effectiveWords: 220,
    confidence: 0.9,
    ...overrides,
  };
}

function createVocabRecord(overrides: Partial<VocabExposureRecord> = {}): VocabExposureRecord {
  return {
    lemma: 'resilience',
    language: 'en',
    seenCount: 4,
    effectiveSeenCount: 1,
    savedCount: 0,
    lastSeenAt: morningOnJune27,
    packTags: ['architecture'],
    userStatus: 'learning',
    ...overrides,
  };
}

function createSavedItemRecord(overrides: Partial<SavedItemRecord> = {}): SavedItemRecord {
  return {
    id: 'saved-1',
    text: 'fail gracefully under pressure',
    type: 'phrase',
    sourceDomain: 'developer.mozilla.org',
    tags: ['selection'],
    createdAt: morningOnJune27,
    ...overrides,
  };
}

function createPdfAnnotationRecord(
  overrides: Partial<PdfAnnotationRecord> = {},
): PdfAnnotationRecord {
  return {
    id: 'pdf-annotation-1',
    resourceId: `pdf_${'a'.repeat(64)}`,
    pageIndex: 2,
    type: 'excerpt',
    quote: 'fail gracefully under pressure',
    textHash: 'quote-hash',
    sourceRects: [{
      pageIndex: 2,
      x: 72,
      y: 144,
      width: 180,
      height: 18,
    }],
    createdAt: morningOnJune27,
    updatedAt: morningOnJune27,
    ...overrides,
  };
}

function createDailyStat(date: string, overrides: Partial<DailyStatRecord> = {}): DailyStatRecord {
  return {
    date,
    effectiveWords: 100,
    minutes: 1,
    streak: 0,
    topDomains: [],
    ...overrides,
  };
}
