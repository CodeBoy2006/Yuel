import {
  db,
  type DailyStatRecord,
  type PageRecord,
  type VocabExposureRecord,
} from './schema';

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

export interface RecentPageSummary {
  pageId: string;
  domain: string;
  totalWords: number;
  effectiveWords: number;
  lastReadAt: number;
}

export interface RecentVocabularySummary {
  lemma: string;
  seenCount: number;
  effectiveSeenCount: number;
  lookupCount: number;
  savedCount: number;
  lastSeenAt: number;
  packTags: string[];
  userStatus: VocabExposureRecord['userStatus'];
}

export interface ReadingDashboardDetails {
  summary: TodayReadingSummary;
  recentPages: RecentPageSummary[];
  recentVocabulary: RecentVocabularySummary[];
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
        toArray: () => Promise<PageRecord[]>;
      };
    };
    orderBy: (index: string) => {
      reverse: () => {
        limit: (count: number) => {
          toArray: () => Promise<PageRecord[]>;
        };
      };
    };
  };
  vocabExposures: {
    where: (index: string) => {
      equals: (value: string) => {
        count: () => Promise<number>;
      };
    };
    orderBy: (index: string) => {
      reverse: () => {
        limit: (count: number) => {
          toArray: () => Promise<VocabExposureRecord[]>;
        };
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
  const [dailyStat, todayPages, learningWords] = await Promise.all([
    store.dailyStats.get(date),
    store.pages.where('lastReadAt').aboveOrEqual(startOfDay).toArray(),
    store.vocabExposures.where('userStatus').equals('learning').count(),
  ]);
  const readPages = todayPages.filter(hasMeasuredReading).length;

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

export async function getReadingDashboardDetails(
  store: ReadingStatsStore = db,
  now = Date.now(),
): Promise<ReadingDashboardDetails> {
  const [summary, recentPageRecords, recentVocabularyRecords] = await Promise.all([
    getTodayReadingSummary(store, now),
    store.pages.orderBy('lastReadAt').reverse().limit(5).toArray(),
    store.vocabExposures.orderBy('lastSeenAt').reverse().limit(8).toArray(),
  ]);

  const recentPages = recentPageRecords
    .filter(hasMeasuredReading)
    .map((page): RecentPageSummary => ({
      pageId: page.pageId,
      domain: page.domain,
      totalWords: page.totalWords,
      effectiveWords: page.effectiveWords,
      lastReadAt: page.lastReadAt,
    }));
  const recentVocabulary = recentVocabularyRecords.map((vocab): RecentVocabularySummary => ({
    lemma: vocab.lemma,
    seenCount: vocab.seenCount,
    effectiveSeenCount: vocab.effectiveSeenCount,
    lookupCount: vocab.lookupCount,
    savedCount: vocab.savedCount,
    lastSeenAt: vocab.lastSeenAt,
    packTags: vocab.packTags,
    userStatus: vocab.userStatus,
  }));

  return {
    summary,
    recentPages,
    recentVocabulary,
    hasData: summary.hasData || recentPages.length > 0 || recentVocabulary.length > 0,
  };
}

function hasMeasuredReading(page: PageRecord): boolean {
  return page.effectiveWords > 0;
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
