import { createPageId } from '../domain/events';
import { hasCompletedDailyCheckIn } from '../domain/checkIn';
import { formatLocalDate, shiftLocalDate } from '../domain/localDate';
import { getDailyCheckInThresholdWords } from './checkInSettings';
import { normalizeHttpUrl } from './savedItemNormalization';
import {
  db,
  type DailyStatRecord,
  type PageRecord,
  type PdfAnnotationRecord,
  type ReadingSessionRecord,
  type SavedItemRecord,
  type VocabExposureRecord,
} from './schema';

export interface TodayReadingSummary {
  date: string;
  effectiveWords: number;
  minutes: number;
  streak: number;
  checkInThresholdWords: number;
  checkInCompleted: boolean;
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
}

export interface RecentPageSummary {
  pageId: string;
  domain: string;
  totalWords: number;
  effectiveWords: number;
  coveredWords: number;
  effectiveMinutes: number;
  lastReadAt: number;
}

export interface ReadingSessionSourceSummary {
  domain: string;
  resourceType?: ReadingSessionRecord['resourceType'];
  effectiveMinutes: number;
}

export interface ReadingFocusSessionSummary {
  id: string;
  date: string;
  startedAt: number;
  endedAt: number;
  effectiveMinutes: number;
  effectiveWords: number;
  pageCount: number;
  sources: ReadingSessionSourceSummary[];
}

export interface CurrentPageReadingSummary {
  totalWords: number;
  effectiveWords: number;
  coveredWords: number;
  effectiveMinutes: number;
  confidence?: number;
  hasData: boolean;
}

export interface RecentVocabularySummary {
  lemma: string;
  effectiveSeenCount: number;
  savedCount: number;
  packTags: string[];
  userStatus: VocabExposureRecord['userStatus'];
}

export interface RecentSavedItemSummary {
  id: string;
  text: string;
  type: SavedItemRecord['type'];
  sourceDomain: string;
  sourceUrl?: string;
  sourceTitle?: string;
  tags: string[];
  userTags?: string[];
  note?: string;
  pdfAnchor?: {
    annotationId: string;
    resourceId: string;
    pageIndex: number;
    pageCoordinates?: {
      x: number;
      y: number;
    };
  };
  createdAt: number;
}

export interface ReadingDashboardDetails {
  summary: TodayReadingSummary;
  history: ReadingHistoryDay[];
  readingSessions: ReadingFocusSessionSummary[];
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
  metadata: {
    get: (key: string) => Promise<{ key: string; numberValue: number } | undefined>;
  };
  dailyStats: {
    get: (date: string) => Promise<DailyStatRecord | undefined>;
    bulkGet: (dates: string[]) => Promise<Array<DailyStatRecord | undefined>>;
  };
  readingSessions: {
    where: (index: string) => {
      aboveOrEqual: (value: number) => {
        toArray: () => Promise<ReadingSessionRecord[]>;
      };
    };
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
  pdfAnnotations?: {
    bulkGet: (ids: string[]) => Promise<Array<PdfAnnotationRecord | undefined>>;
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
const READING_SESSION_MERGE_GAP_MS = 5 * 60_000;

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
  let cursor = shiftLocalDate(date, -1);

  while (true) {
    const dailyStat = await store.dailyStats.get(cursor);
    if (!dailyStat || !hasCompletedDailyCheckIn(dailyStat, checkInThresholdWords)) {
      return streak;
    }

    streak += 1;
    cursor = shiftLocalDate(cursor, -1);
  }
}

export async function getReadingDashboardDetails(
  store: ReadingStatsStore = db,
  now = Date.now(),
): Promise<ReadingDashboardDetails> {
  const historyDates = createDashboardHistoryDates(now);
  const historyStartedAt = parseLocalDate(historyDates[0]).getTime();
  const [
    summary,
    history,
    readingSessionRecords,
    recentPageRecords,
    recentVocabularyRecords,
    recentSavedItemRecords,
  ] = await Promise.all([
    getTodayReadingSummary(store, now),
    getDashboardReadingHistory(store, historyDates),
    store.readingSessions.where('endedAt').aboveOrEqual(historyStartedAt).toArray(),
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
      effectiveMinutes: Math.max(0, page.effectiveReadingMs ?? 0) / 60_000,
      lastReadAt: page.lastReadAt,
    }));
  const readingSessions = createReadingFocusSessionSummaries(readingSessionRecords);
  const recentVocabulary = createRecentVocabularySummaries(recentVocabularyRecords);
  const recentSavedItems = createRecentSavedItemSummaries(
    recentSavedItemRecords,
    RECENT_SAVED_ITEM_LIMIT,
    await loadPdfAnnotationsForSavedItems(store, recentSavedItemRecords),
  );

  const hasHistoricalReading = history.some((day) => day.effectiveWords > 0 || day.minutes > 0);
  const hasData = summary.hasData
    || hasHistoricalReading
    || readingSessions.length > 0
    || recentPages.length > 0
    || recentVocabulary.length > 0
    || recentSavedItems.length > 0;

  return {
    summary,
    history,
    readingSessions,
    recentPages,
    recentVocabulary,
    recentSavedItems,
    hasData,
  };
}

async function getDashboardReadingHistory(
  store: ReadingStatsStore,
  dates: string[],
): Promise<ReadingHistoryDay[]> {
  const [dailyStats, checkInThresholdWords] = await Promise.all([
    store.dailyStats.bulkGet(dates),
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
    };
  });
}

function createReadingFocusSessionSummaries(
  records: ReadingSessionRecord[],
): ReadingFocusSessionSummary[] {
  const accumulators: ReadingFocusSessionAccumulator[] = [];

  for (const record of records
    .filter((candidate) => candidate.effectiveReadingMs > 0)
    .sort((left, right) => left.startedAt - right.startedAt)) {
    const current = accumulators.at(-1);
    if (
      current
      && current.date === record.date
      && record.startedAt - current.endedAt <= READING_SESSION_MERGE_GAP_MS
    ) {
      addReadingSessionRecord(current, record);
      continue;
    }

    const next: ReadingFocusSessionAccumulator = {
      id: record.id,
      date: record.date,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      effectiveReadingMs: 0,
      effectiveWords: 0,
      pageIds: new Set(),
      sources: new Map(),
    };
    addReadingSessionRecord(next, record);
    accumulators.push(next);
  }

  return accumulators
    .map((session): ReadingFocusSessionSummary => ({
      id: session.id,
      date: session.date,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      effectiveMinutes: session.effectiveReadingMs / 60_000,
      effectiveWords: session.effectiveWords,
      pageCount: session.pageIds.size,
      sources: Array.from(session.sources.values())
        .sort((left, right) => right.effectiveReadingMs - left.effectiveReadingMs)
        .map((source) => ({
          domain: source.domain,
          resourceType: source.resourceType,
          effectiveMinutes: source.effectiveReadingMs / 60_000,
        })),
    }))
    .sort((left, right) => right.startedAt - left.startedAt);
}

interface ReadingFocusSessionAccumulator {
  id: string;
  date: string;
  startedAt: number;
  endedAt: number;
  effectiveReadingMs: number;
  effectiveWords: number;
  pageIds: Set<string>;
  sources: Map<string, ReadingSessionSourceAccumulator>;
}

interface ReadingSessionSourceAccumulator {
  domain: string;
  resourceType?: ReadingSessionRecord['resourceType'];
  effectiveReadingMs: number;
}

function addReadingSessionRecord(
  session: ReadingFocusSessionAccumulator,
  record: ReadingSessionRecord,
): void {
  session.startedAt = Math.min(session.startedAt, record.startedAt);
  session.endedAt = Math.max(session.endedAt, record.endedAt);
  session.effectiveReadingMs += Math.max(0, record.effectiveReadingMs);
  session.effectiveWords += Math.max(0, record.effectiveWords);
  session.pageIds.add(record.pageId);

  const domain = normalizeDisplayDomain(record.domain);
  const sourceKey = `${record.resourceType ?? 'web'}:${domain}`;
  const existingSource = session.sources.get(sourceKey);
  session.sources.set(sourceKey, {
    domain,
    resourceType: record.resourceType,
    effectiveReadingMs: (existingSource?.effectiveReadingMs ?? 0) + Math.max(0, record.effectiveReadingMs),
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
    dates.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
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
  const pdfAnnotations = await loadPdfAnnotationsForSavedItems(store, recentSavedItemRecords);

  return {
    summary,
    recentVocabulary: createRecentVocabularySummaries(recentVocabularyRecords, SIDE_PANEL_VOCABULARY_LIMIT),
    recentSavedItems: createRecentSavedItemSummaries(
      recentSavedItemRecords,
      SIDE_PANEL_SAVED_ITEM_LIMIT,
      pdfAnnotations,
    ),
  };
}

export async function getCurrentPageReadingSummary(
  url: string,
  store: ReadingStatsStore = db,
): Promise<CurrentPageReadingSummary> {
  return getPageReadingSummary(createPageId(url), store);
}

export async function getPageReadingSummary(
  pageId: string,
  store: ReadingStatsStore = db,
): Promise<CurrentPageReadingSummary> {
  const page = await store.pages.get(pageId);

  if (!page) {
    return {
      totalWords: 0,
      effectiveWords: 0,
      coveredWords: 0,
      effectiveMinutes: 0,
      hasData: false,
    };
  }

  return {
    totalWords: Math.max(0, page.totalWords),
    effectiveWords: Math.max(0, page.effectiveWords),
    coveredWords: getPageCoveredWords(page),
    effectiveMinutes: Math.max(0, page.effectiveReadingMs ?? 0) / 60_000,
    confidence: page.confidence,
    hasData: page.effectiveWords > 0 || (page.effectiveReadingMs ?? 0) > 0,
  };
}

function hasMeasuredReading(page: PageRecord): boolean {
  return page.effectiveWords > 0 || (page.effectiveReadingMs ?? 0) > 0;
}

function getPageCoveredWords(page: PageRecord): number {
  const totalWords = Math.max(0, page.totalWords);
  const measuredCoverage = Math.max(0, page.coveredWords ?? page.newWords ?? page.effectiveWords);
  return Math.min(totalWords, measuredCoverage);
}

function hasVisibleVocabularyMemory(vocab: VocabExposureRecord): boolean {
  return (
    normalizeInlineText(vocab.lemma).length > 0 &&
    vocab.userStatus !== 'ignored' &&
    (vocab.effectiveSeenCount > 0 || vocab.savedCount > 0)
  );
}

function hasVisibleSavedItem(item: SavedItemRecord): boolean {
  return normalizeInlineText(item.text).length > 0;
}

function createRecentVocabularySummaries(
  records: VocabExposureRecord[],
  limit = RECENT_VOCABULARY_LIMIT,
): RecentVocabularySummary[] {
  return records
    .filter(hasVisibleVocabularyMemory)
    .slice(0, limit)
    .map((vocab) => ({
      lemma: normalizeInlineText(vocab.lemma),
      effectiveSeenCount: vocab.effectiveSeenCount,
      savedCount: vocab.savedCount,
      packTags: normalizeTags(vocab.packTags),
      userStatus: vocab.userStatus,
    }));
}

function createRecentSavedItemSummaries(
  records: SavedItemRecord[],
  limit = RECENT_SAVED_ITEM_LIMIT,
  pdfAnnotations = new Map<string, PdfAnnotationRecord>(),
): RecentSavedItemSummary[] {
  return records
    .filter(hasVisibleSavedItem)
    .slice(0, limit)
    .map((item) => {
      const annotation = item.pdfAnnotationId
        ? pdfAnnotations.get(item.pdfAnnotationId)
        : undefined;
      const firstRect = annotation?.sourceRects.find(
        (rect) => rect.pageIndex === annotation.pageIndex,
      ) ?? annotation?.sourceRects[0];
      const sourceUrl = normalizeHttpUrl(item.sourceUrl);
      const sourceTitle = normalizeInlineText(item.sourceTitle ?? '');
      const userTags = normalizeTags(item.userTags ?? []);
      const note = normalizeSavedItemNote(item.note);

      return {
        id: item.id,
        text: normalizeInlineText(item.text),
        type: item.type,
        sourceDomain: normalizeDisplayDomain(item.sourceDomain),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(sourceTitle ? { sourceTitle } : {}),
        tags: normalizeTags(item.tags),
        ...(userTags.length > 0 ? { userTags } : {}),
        ...(note ? { note } : {}),
        ...(annotation ? {
          pdfAnchor: {
            annotationId: annotation.id,
            resourceId: annotation.resourceId,
            pageIndex: annotation.pageIndex,
            ...(firstRect ? {
              pageCoordinates: {
                x: firstRect.x,
                y: firstRect.y,
              },
            } : {}),
          },
        } : {}),
        createdAt: item.createdAt,
      };
    });
}

async function loadPdfAnnotationsForSavedItems(
  store: ReadingStatsStore,
  records: SavedItemRecord[],
): Promise<Map<string, PdfAnnotationRecord>> {
  const annotationIds = Array.from(new Set(
    records.flatMap((item) => item.pdfAnnotationId ? [item.pdfAnnotationId] : []),
  ));
  if (annotationIds.length === 0 || !store.pdfAnnotations) {
    return new Map();
  }

  const annotations = await store.pdfAnnotations.bulkGet(annotationIds);
  return new Map(
    annotations.flatMap((annotation) => annotation ? [[annotation.id, annotation] as const] : []),
  );
}

function normalizeTopDomains(topDomains: string[]): string[] {
  return Array.from(new Set(topDomains.map((domain) => domain.trim()).filter(Boolean)));
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeSavedItemNote(note: string | undefined): string {
  return note?.replace(/\r\n?/g, '\n').trim() ?? '';
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeDisplayDomain(domain: string): string {
  const normalized = domain.trim();
  return normalized || 'unknown';
}

function getLocalStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
