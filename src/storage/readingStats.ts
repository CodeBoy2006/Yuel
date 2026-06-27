import { db, type DailyStatRecord } from './schema';

export interface TodayReadingSummary {
  date: string;
  effectiveWords: number;
  minutes: number;
  advancedWords: number;
  expressions: number;
  streak: number;
  topDomains: string[];
  readPages: number;
  learningWords: number;
  hasData: boolean;
}

export interface ReadingStatsStore {
  dailyStats: {
    get: (date: string) => Promise<DailyStatRecord | undefined>;
  };
  pages: {
    where: (index: string) => {
      aboveOrEqual: (value: number) => {
        count: () => Promise<number>;
      };
    };
  };
  vocabExposures: {
    where: (index: string) => {
      equals: (value: string) => {
        count: () => Promise<number>;
      };
    };
  };
}

export async function getTodayReadingSummary(
  store: ReadingStatsStore = db,
  now = Date.now(),
): Promise<TodayReadingSummary> {
  const date = formatLocalDate(now);
  const startOfDay = getLocalStartOfDay(now);
  const [dailyStat, readPages, learningWords] = await Promise.all([
    store.dailyStats.get(date),
    store.pages.where('lastReadAt').aboveOrEqual(startOfDay).count(),
    store.vocabExposures.where('userStatus').equals('learning').count(),
  ]);

  const summary: TodayReadingSummary = {
    date,
    effectiveWords: dailyStat?.effectiveWords ?? 0,
    minutes: dailyStat?.minutes ?? 0,
    advancedWords: dailyStat?.advancedWords ?? 0,
    expressions: dailyStat?.expressions ?? 0,
    streak: dailyStat?.streak ?? 0,
    topDomains: dailyStat?.topDomains ?? [],
    readPages,
    learningWords,
    hasData: false,
  };

  return {
    ...summary,
    hasData:
      summary.effectiveWords > 0 ||
      summary.minutes > 0 ||
      summary.advancedWords > 0 ||
      summary.expressions > 0 ||
      summary.readPages > 0 ||
      summary.learningWords > 0,
  };
}

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
