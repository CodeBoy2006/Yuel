import {
  db,
  type DailyStatRecord,
  type PageRecord,
  type SavedItemRecord,
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

export interface RecentSavedItemSummary {
  id: string;
  text: string;
  type: SavedItemRecord['type'];
  sourceDomain: string;
  tags: string[];
  createdAt: number;
}

export interface ReadingDashboardDetails {
  summary: TodayReadingSummary;
  recentPages: RecentPageSummary[];
  recentVocabulary: RecentVocabularySummary[];
  recentSavedItems: RecentSavedItemSummary[];
  summaryCardText: string;
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
  savedItems: {
    orderBy: (index: string) => {
      reverse: () => {
        limit: (count: number) => {
          toArray: () => Promise<SavedItemRecord[]>;
        };
      };
    };
  };
}

const RECENT_MEASURED_PAGE_LIMIT = 5;
const RECENT_PAGE_SCAN_LIMIT = 20;
const RECENT_VOCABULARY_LIMIT = 8;
const RECENT_VOCABULARY_SCAN_LIMIT = 20;
const RECENT_SAVED_ITEM_LIMIT = 5;
const RECENT_SAVED_ITEM_SCAN_LIMIT = 20;

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
    topDomains: normalizeTopDomains(dailyStat?.topDomains ?? []),
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
  const [summary, recentPageRecords, recentVocabularyRecords, recentSavedItemRecords] = await Promise.all([
    getTodayReadingSummary(store, now),
    store.pages.orderBy('lastReadAt').reverse().limit(RECENT_PAGE_SCAN_LIMIT).toArray(),
    store.vocabExposures.orderBy('lastSeenAt').reverse().limit(RECENT_VOCABULARY_SCAN_LIMIT).toArray(),
    store.savedItems.orderBy('createdAt').reverse().limit(RECENT_SAVED_ITEM_SCAN_LIMIT).toArray(),
  ]);

  const recentPages = recentPageRecords
    .filter(hasMeasuredReading)
    .slice(0, RECENT_MEASURED_PAGE_LIMIT)
    .map((page): RecentPageSummary => ({
      pageId: page.pageId,
      domain: normalizeDisplayDomain(page.domain),
      totalWords: page.totalWords,
      effectiveWords: page.effectiveWords,
      lastReadAt: page.lastReadAt,
    }));
  const recentVocabulary = recentVocabularyRecords
    .filter(hasVisibleVocabularyMemory)
    .slice(0, RECENT_VOCABULARY_LIMIT)
    .map((vocab): RecentVocabularySummary => ({
      lemma: vocab.lemma,
      seenCount: vocab.seenCount,
      effectiveSeenCount: vocab.effectiveSeenCount,
      lookupCount: vocab.lookupCount,
      savedCount: vocab.savedCount,
      lastSeenAt: vocab.lastSeenAt,
      packTags: vocab.packTags,
      userStatus: vocab.userStatus,
    }));
  const recentSavedItems = recentSavedItemRecords
    .filter(hasVisibleSavedItem)
    .slice(0, RECENT_SAVED_ITEM_LIMIT)
    .map((item): RecentSavedItemSummary => ({
      id: item.id,
      text: normalizeSavedItemText(item.text),
      type: item.type,
      sourceDomain: normalizeDisplayDomain(item.sourceDomain),
      tags: normalizeSavedItemTags(item.tags),
      createdAt: item.createdAt,
    }));

  const hasData = summary.hasData || recentPages.length > 0 || recentVocabulary.length > 0 || recentSavedItems.length > 0;

  return {
    summary,
    recentPages,
    recentVocabulary,
    recentSavedItems,
    summaryCardText: buildSummaryCardText(summary, recentVocabulary, recentSavedItems, hasData),
    hasData,
  };
}

function hasMeasuredReading(page: PageRecord): boolean {
  return page.effectiveWords > 0;
}

function hasVisibleVocabularyMemory(vocab: VocabExposureRecord): boolean {
  return vocab.userStatus !== 'ignored' && (vocab.effectiveSeenCount > 0 || vocab.savedCount > 0);
}

function hasVisibleSavedItem(item: SavedItemRecord): boolean {
  return normalizeSavedItemText(item.text).length > 0;
}

function normalizeTopDomains(topDomains: string[]): string[] {
  return Array.from(new Set(topDomains.map((domain) => domain.trim()).filter(Boolean)));
}

function normalizeSavedItemText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeSavedItemTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeDisplayDomain(domain: string): string {
  const normalized = domain.trim();
  return normalized || 'unknown';
}

function buildSummaryCardText(
  summary: TodayReadingSummary,
  recentVocabulary: RecentVocabularySummary[],
  recentSavedItems: RecentSavedItemSummary[],
  hasData: boolean,
): string {
  if (!hasData) {
    return `Yuel Reading - ${summary.date}\nNo reading data yet.`;
  }

  const lines = [
    `Yuel Reading - ${summary.date}`,
    `Effective words: ${formatCardCount(summary.effectiveWords)}`,
    `Reading time: ${formatCardMinutes(summary.minutes)}`,
    `Pages: ${summary.readPages}`,
  ];

  if (summary.topDomains.length > 0) {
    lines.push(`Top domains: ${summary.topDomains.slice(0, 2).join(', ')}`);
  }

  if (recentVocabulary.length > 0) {
    lines.push(`Vocabulary: ${recentVocabulary.slice(0, 3).map((vocab) => vocab.lemma).join(', ')}`);
  }

  if (recentSavedItems.length > 0) {
    lines.push(`Saved: ${truncateCardText(recentSavedItems[0].text)}`);
  }

  return lines.join('\n');
}

function formatCardCount(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatCardMinutes(value: number): string {
  if (value < 1 && value > 0) {
    return '<1 min';
  }

  return `${Math.round(value)} min`;
}

function truncateCardText(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
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
