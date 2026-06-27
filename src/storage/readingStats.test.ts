import { describe, expect, it } from 'vitest';

import { getReadingDashboardDetails, getTodayReadingSummary, type ReadingStatsStore } from './readingStats';

const morningOnJune27 = new Date(2026, 5, 27, 10, 0, 0).getTime();

function createStore({
  dailyStat,
  readPages = 0,
  learningWords = 0,
  recentPages = [],
  recentVocabulary = [],
}: {
  dailyStat?: {
    effectiveWords: number;
    minutes: number;
    advancedWords: number;
    expressions: number;
    streak: number;
    topDomains: string[];
  };
  readPages?: number;
  learningWords?: number;
  recentPages?: Array<{
    pageId: string;
    domain: string;
    titleHash: string;
    urlHash: string;
    language: string;
    totalWords: number;
    effectiveWords: number;
    difficultyScore: number;
    firstSeenAt: number;
    lastReadAt: number;
  }>;
  recentVocabulary?: Array<{
    lemma: string;
    language: string;
    seenCount: number;
    effectiveSeenCount: number;
    lookupCount: number;
    savedCount: number;
    lastSeenAt: number;
    packTags: string[];
    userStatus: 'new' | 'known' | 'learning' | 'ignored';
  }>;
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
                return readPages;
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
                expect(count).toBe(5);
                return {
                  async toArray() {
                    return recentPages;
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
                expect(count).toBe(8);
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
        readPages: 4,
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
        readPages: 2,
        learningWords: 1,
        recentPages: [
          {
            pageId: 'page-2',
            domain: 'github.com',
            titleHash: 'title-2',
            urlHash: 'url-2',
            language: 'en',
            totalWords: 400,
            effectiveWords: 220,
            difficultyScore: 0,
            firstSeenAt: morningOnJune27 - 2_000,
            lastReadAt: morningOnJune27,
          },
        ],
        recentVocabulary: [
          {
            lemma: 'resilience',
            language: 'en',
            seenCount: 4,
            effectiveSeenCount: 3,
            lookupCount: 1,
            savedCount: 0,
            lastSeenAt: morningOnJune27,
            packTags: ['architecture'],
            userStatus: 'learning',
          },
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
    expect(details.hasData).toBe(true);
  });
});
