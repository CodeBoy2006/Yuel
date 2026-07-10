import {
  createPageId,
  getDomain,
} from '../domain/events';
import { hasCompletedDailyCheckIn } from '../domain/checkIn';
import { getDailyCheckInThresholdWords } from './checkInSettings';
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
  checkInThresholdWords?: number;
  checkInCompleted?: boolean;
  topDomains: string[];
  readPages: number;
  learningWords: number;
  hasData: boolean;
}

export interface ReadingHistoryDay {
  date: string;
  effectiveWords: number;
  minutes: number;
  newWords: number;
  reviewWords: number;
  checkInCompleted: boolean;
  topDomains: string[];
}

export interface RecentPageSummary {
  pageId: string;
  domain: string;
  totalWords: number;
  effectiveWords: number;
  coveredWords: number;
  lastReadAt: number;
}

export interface CurrentPageReadingSummary {
  pageId: string;
  domain: string;
  totalWords: number;
  effectiveWords: number;
  coveredWords: number;
  effectiveMinutes: number;
  confidence?: number;
  lastReadAt?: number;
  hasData: boolean;
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
  history?: ReadingHistoryDay[];
  recentPages: RecentPageSummary[];
  recentVocabulary: RecentVocabularySummary[];
  recentSavedItems: RecentSavedItemSummary[];
  hasData: boolean;
}

export interface SidePanelReadingDetails {
  summary: TodayReadingSummary;
  recentVocabulary: RecentVocabularySummary[];
  recentSavedItems: RecentSavedItemSummary[];
}

export interface ReadingStatsStore {
  metadata?: {
    get: (key: string) => Promise<{ key: string; numberValue: number } | undefined>;
  };
  dailyStats: {
    get: (date: string) => Promise<DailyStatRecord | undefined>;
    bulkGet?: (dates: string[]) => Promise<Array<DailyStatRecord | undefined>>;
  };
  pages: {
    get: (pageId: string) => Promise<PageRecord | undefined>;
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
const SIDE_PANEL_VOCABULARY_LIMIT = 5;
const SIDE_PANEL_SAVED_ITEM_LIMIT = 1;
const DASHBOARD_HISTORY_WEEKS = 13;

export async function getTodayReadingSummary(
  store: ReadingStatsStore = db,
  now = Date.now(),
): Promise<TodayReadingSummary> {
  const date = formatLocalDate(now);
  const startOfDay = getLocalStartOfDay(now);
  const [dailyStat, todayPages, learningWords, checkInThresholdWords] = await Promise.all([
    store.dailyStats.get(date),
    store.pages.where('lastReadAt').aboveOrEqual(startOfDay).toArray(),
    store.vocabExposures.where('userStatus').equals('learning').count(),
    getDailyCheckInThresholdWords(store),
  ]);
  const readPages = todayPages.filter(hasMeasuredReading).length;
  const checkInCompleted = Boolean(dailyStat && hasCompletedDailyCheckIn(dailyStat, checkInThresholdWords));
  const streak = dailyStat && checkInCompleted
    ? dailyStat.checkInThresholdWords === checkInThresholdWords && dailyStat.streak > 0
      ? dailyStat.streak
      : await recoverReadingStreak(store, date, checkInThresholdWords)
    : 0;

  const summary: TodayReadingSummary = {
    date,
    effectiveWords: dailyStat?.effectiveWords ?? 0,
    minutes: dailyStat?.minutes ?? 0,
    advancedWords: dailyStat?.advancedWords ?? 0,
    expressions: dailyStat?.expressions ?? 0,
    streak,
    checkInThresholdWords,
    checkInCompleted,
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

async function recoverReadingStreak(
  store: ReadingStatsStore,
  date: string,
  checkInThresholdWords: number,
): Promise<number> {
  let streak = 1;
  let cursor = previousLocalDate(date);

  while (true) {
    const dailyStat = await store.dailyStats.get(cursor);
    if (!dailyStat || !hasCompletedDailyCheckIn(dailyStat, checkInThresholdWords)) {
      return streak;
    }

    streak += 1;
    cursor = previousLocalDate(cursor);
  }
}

function previousLocalDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(year, month - 1, day);
  previous.setDate(previous.getDate() - 1);
  return formatLocalDate(previous.getTime());
}

export async function getReadingDashboardDetails(
  store: ReadingStatsStore = db,
  now = Date.now(),
): Promise<ReadingDashboardDetails> {
  const [summary, history, recentPageRecords, recentVocabularyRecords, recentSavedItemRecords] = await Promise.all([
    getTodayReadingSummary(store, now),
    getDashboardReadingHistory(store, now),
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
      coveredWords: getPageCoveredWords(page),
      lastReadAt: page.lastReadAt,
    }));
  const recentVocabulary = createRecentVocabularySummaries(recentVocabularyRecords);
  const recentSavedItems = createRecentSavedItemSummaries(recentSavedItemRecords);

  const hasHistoricalReading = history.some((day) => day.effectiveWords > 0 || day.minutes > 0);
  const hasData = summary.hasData
    || hasHistoricalReading
    || recentPages.length > 0
    || recentVocabulary.length > 0
    || recentSavedItems.length > 0;

  return {
    summary,
    history,
    recentPages,
    recentVocabulary,
    recentSavedItems,
    hasData,
  };
}

async function getDashboardReadingHistory(
  store: ReadingStatsStore,
  now: number,
): Promise<ReadingHistoryDay[]> {
  const dates = createDashboardHistoryDates(now);
  const [dailyStats, checkInThresholdWords] = await Promise.all([
    store.dailyStats.bulkGet
      ? store.dailyStats.bulkGet(dates)
      : Promise.all(dates.map((date) => store.dailyStats.get(date))),
    getDailyCheckInThresholdWords(store),
  ]);

  return dates.map((date, index) => {
    const dailyStat = dailyStats[index];

    return {
      date,
      effectiveWords: Math.max(0, dailyStat?.effectiveWords ?? 0),
      minutes: Math.max(0, dailyStat?.minutes ?? 0),
      newWords: Math.max(0, dailyStat?.newWords ?? 0),
      reviewWords: Math.max(0, dailyStat?.reviewWords ?? 0),
      checkInCompleted: Boolean(dailyStat && hasCompletedDailyCheckIn(dailyStat, checkInThresholdWords)),
      topDomains: normalizeTopDomains(dailyStat?.topDomains ?? []),
    };
  });
}

function createDashboardHistoryDates(now: number): string[] {
  const today = new Date(now);
  // Noon keeps local calendar stepping stable across daylight-saving transitions.
  today.setHours(12, 0, 0, 0);
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const firstMonday = new Date(today);
  firstMonday.setDate(today.getDate() - daysSinceMonday - (DASHBOARD_HISTORY_WEEKS - 1) * 7);

  const dates: string[] = [];
  const cursor = new Date(firstMonday);
  while (cursor <= today) {
    dates.push(formatLocalDate(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export async function getSidePanelReadingDetails(
  store: ReadingStatsStore = db,
  now = Date.now(),
): Promise<SidePanelReadingDetails> {
  const [summary, recentVocabularyRecords, recentSavedItemRecords] = await Promise.all([
    getTodayReadingSummary(store, now),
    store.vocabExposures.orderBy('lastSeenAt').reverse().limit(RECENT_VOCABULARY_SCAN_LIMIT).toArray(),
    store.savedItems.orderBy('createdAt').reverse().limit(RECENT_SAVED_ITEM_SCAN_LIMIT).toArray(),
  ]);

  return {
    summary,
    recentVocabulary: createRecentVocabularySummaries(recentVocabularyRecords, SIDE_PANEL_VOCABULARY_LIMIT),
    recentSavedItems: createRecentSavedItemSummaries(recentSavedItemRecords, SIDE_PANEL_SAVED_ITEM_LIMIT),
  };
}

export async function getCurrentPageReadingSummary(
  url: string,
  store: ReadingStatsStore = db,
): Promise<CurrentPageReadingSummary> {
  const pageId = createPageId(url);
  const page = await store.pages.get(pageId);

  if (!page) {
    return {
      pageId,
      domain: getDomain(url),
      totalWords: 0,
      effectiveWords: 0,
      coveredWords: 0,
      effectiveMinutes: 0,
      hasData: false,
    };
  }

  return {
    pageId: page.pageId,
    domain: normalizeDisplayDomain(page.domain),
    totalWords: Math.max(0, page.totalWords),
    effectiveWords: Math.max(0, page.effectiveWords),
    coveredWords: getPageCoveredWords(page),
    effectiveMinutes: Math.max(0, page.effectiveReadingMs ?? 0) / 60_000,
    confidence: page.confidence,
    lastReadAt: page.lastReadAt,
    hasData: page.effectiveWords > 0 || (page.effectiveReadingMs ?? 0) > 0,
  };
}

function hasMeasuredReading(page: PageRecord): boolean {
  return page.effectiveWords > 0;
}

function getPageCoveredWords(page: PageRecord): number {
  const totalWords = Math.max(0, page.totalWords);
  const measuredCoverage = Math.max(0, page.coveredWords ?? page.newWords ?? page.effectiveWords);
  return Math.min(totalWords, measuredCoverage);
}

function hasVisibleVocabularyMemory(vocab: VocabExposureRecord): boolean {
  return (
    normalizeVocabularyLemma(vocab.lemma).length > 0 &&
    vocab.userStatus !== 'ignored' &&
    (vocab.effectiveSeenCount > 0 || vocab.savedCount > 0)
  );
}

function hasVisibleSavedItem(item: SavedItemRecord): boolean {
  return normalizeSavedItemText(item.text).length > 0;
}

function createRecentVocabularySummaries(
  records: VocabExposureRecord[],
  limit = RECENT_VOCABULARY_LIMIT,
): RecentVocabularySummary[] {
  return records
    .filter(hasVisibleVocabularyMemory)
    .slice(0, limit)
    .map((vocab) => ({
      lemma: normalizeVocabularyLemma(vocab.lemma),
      seenCount: vocab.seenCount,
      effectiveSeenCount: vocab.effectiveSeenCount,
      lookupCount: vocab.lookupCount,
      savedCount: vocab.savedCount,
      lastSeenAt: vocab.lastSeenAt,
      packTags: normalizeTags(vocab.packTags),
      userStatus: vocab.userStatus,
    }));
}

function createRecentSavedItemSummaries(
  records: SavedItemRecord[],
  limit = RECENT_SAVED_ITEM_LIMIT,
): RecentSavedItemSummary[] {
  return records
    .filter(hasVisibleSavedItem)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      text: normalizeSavedItemText(item.text),
      type: item.type,
      sourceDomain: normalizeDisplayDomain(item.sourceDomain),
      tags: normalizeTags(item.tags),
      createdAt: item.createdAt,
    }));
}

function normalizeTopDomains(topDomains: string[]): string[] {
  return Array.from(new Set(topDomains.map((domain) => domain.trim()).filter(Boolean)));
}

function normalizeSavedItemText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeVocabularyLemma(lemma: string): string {
  return lemma.replace(/\s+/g, ' ').trim();
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeDisplayDomain(domain: string): string {
  const normalized = domain.trim();
  return normalized || 'unknown';
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
