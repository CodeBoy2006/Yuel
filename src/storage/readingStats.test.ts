import { describe, expect, it } from 'vitest';

import { getReadingDashboardDetails, getTodayReadingSummary, type ReadingStatsStore } from './readingStats';
import type { PageRecord, SavedItemRecord, VocabExposureRecord } from './schema';

const morningOnJune27 = new Date(2026, 5, 27, 10, 0, 0).getTime();

function createStore({
  dailyStat,
  todayPages = [],
  learningWords = 0,
  expectedRecentPageQueryLimit = 20,
  expectedRecentVocabularyQueryLimit = 20,
  expectedRecentSavedItemQueryLimit = 5,
  recentPages = [],
  recentVocabulary = [],
  recentSavedItems = [],
}: {
  dailyStat?: {
    effectiveWords: number;
    minutes: number;
    advancedWords: number;
    expressions: number;
    streak: number;
    topDomains: string[];
  };
  todayPages?: PageRecord[];
  learningWords?: number;
  expectedRecentPageQueryLimit?: number;
  expectedRecentVocabularyQueryLimit?: number;
  expectedRecentSavedItemQueryLimit?: number;
  recentPages?: PageRecord[];
  recentVocabulary?: VocabExposureRecord[];
  recentSavedItems?: SavedItemRecord[];
}): ReadingStatsStore {
  return {
    dailyStats: {
      async get(date: string) {
        expect(date).toBe('2026-06-27');
        return dailyStat ? { date, ...dailyStat } : undefined;
      },
    },
    pages: {
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
  };
}

describe('getTodayReadingSummary', () => {
  it('loads today reading totals from local storage tables', async () => {
    const summary = await getTodayReadingSummary(
      createStore({
        dailyStat: {
          effectiveWords: 842,
          minutes: 12.5,
          advancedWords: 18,
          expressions: 6,
          streak: 3,
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
      advancedWords: 18,
      expressions: 6,
      streak: 3,
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
      advancedWords: 0,
      expressions: 0,
      streak: 0,
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
          advancedWords: 18,
          expressions: 6,
          streak: 3,
          topDomains: ['  developer.mozilla.org  ', '', 'github.com', 'developer.mozilla.org', '   '],
        },
      }),
      morningOnJune27,
    );

    expect(summary.topDomains).toEqual(['developer.mozilla.org', 'github.com']);
  });
});

describe('getReadingDashboardDetails', () => {
  it('loads today summary plus recent pages and vocabulary exposure details', async () => {
    const details = await getReadingDashboardDetails(
      createStore({
        dailyStat: {
          effectiveWords: 620,
          minutes: 8.25,
          advancedWords: 7,
          expressions: 3,
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
        lastReadAt: morningOnJune27,
      },
    ]);
    expect(details.recentVocabulary).toEqual([
      {
        lemma: 'resilience',
        seenCount: 4,
        effectiveSeenCount: 3,
        lookupCount: 1,
        savedCount: 0,
        lastSeenAt: morningOnJune27,
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
    expect(details.summaryCardText).toContain('Yuel Reading - 2026-06-27');
    expect(details.summaryCardText).toContain('Effective words: 620');
    expect(details.summaryCardText).toContain('Vocabulary: resilience');
    expect(details.summaryCardText).toContain('Saved: fail gracefully under pressure');
    expect(details.hasData).toBe(true);
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
        lastReadAt: morningOnJune27,
      },
    ]);
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
        seenCount: 0,
        effectiveSeenCount: 0,
        lookupCount: 1,
        savedCount: 2,
        lastSeenAt: morningOnJune27,
        packTags: ['architecture'],
        userStatus: 'learning',
      },
    ]);
    expect(details.summaryCardText).toContain('Vocabulary: resilience');
    expect(details.hasData).toBe(true);
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

  it('builds an empty dashboard card when no local reading data exists', async () => {
    const details = await getReadingDashboardDetails(createStore({}), morningOnJune27);

    expect(details.summaryCardText).toBe('Yuel Reading - 2026-06-27\nNo reading data yet.');
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
    difficultyScore: 0,
    firstSeenAt: morningOnJune27 - 2_000,
    lastReadAt: morningOnJune27,
    ...overrides,
  };
}

function createVocabRecord(overrides: Partial<VocabExposureRecord> = {}): VocabExposureRecord {
  return {
    lemma: 'resilience',
    language: 'en',
    seenCount: 4,
    effectiveSeenCount: 1,
    lookupCount: 1,
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
