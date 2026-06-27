import { describe, expect, it } from 'vitest';

import { getTodayReadingSummary, type ReadingStatsStore } from './readingStats';

const morningOnJune27 = new Date(2026, 5, 27, 10, 0, 0).getTime();

function createStore({
  dailyStat,
  readPages = 0,
  learningWords = 0,
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
