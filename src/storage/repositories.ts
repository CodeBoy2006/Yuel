import { analyzeEnglishText, isTrackableEnglishToken } from '../analysis/english';
import type { ReadingEvent } from '../domain/events';
import { matchPackRules, type YuelPack } from '../domain/packs';
import {
  DEFAULT_READING_CONTENT_TYPE,
  createReadingPaceProfileId,
  normalizeReadingPaceLanguage,
  resolveReadingPaceBaseWordsPerMinute,
  updateAdaptiveReadingPaceProfile,
  type AdaptiveReadingPaceSample,
} from '../domain/readingPace';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import techEnglishPack from '../packs/tech-english.pack.json';
import {
  db,
  type ChunkDayRecord,
  type ChunkSessionRecord,
  type PageRecord,
  type ReadingPaceProfileRecord,
  type TextChunkRecord,
  type VocabExposureRecord,
} from './schema';
import { summarizeReadingEventBatch, type ChunkDayReadingState, type ChunkReadingState } from './aggregateReading';

const ACTIVE_PACKS: YuelPack[] = [techEnglishPack as YuelPack];
const READING_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const MIN_ADAPTIVE_PAGE_WORDS = 250;
const MIN_ADAPTIVE_SAMPLE_WORDS = 80;
const MIN_ADAPTIVE_ENGAGED_MS = 20_000;
const MIN_ADAPTIVE_VISIBLE_RATIO = 0.65;
const MIN_ADAPTIVE_CONTENT_WEIGHT = 0.8;
const MIN_ADAPTIVE_CHUNKS = 2;
const MAX_ADAPTIVE_IDLE_MS = 45_000;
const READING_DATA_CLEARED_AT_KEY = 'readingDataClearedAt';

export async function recordReadingEventBatch(payload: ReadingEventBatchPayload): Promise<void> {
  const now = Date.now();

  await db.transaction('rw', [db.pages, db.textChunks, db.chunkSessions, db.chunkDays, db.readingEvents, db.vocabExposures, db.dailyStats, db.readingPaceProfiles, db.metadata], async () => {
    const dataClearedAt = (await db.metadata.get(READING_DATA_CLEARED_AT_KEY))?.numberValue ?? 0;
    const eventsAfterClear = payload.events.flatMap((event) => normalizeEventAfterClear(event, dataClearedAt));
    const newEvents = await getNewReadingEvents(eventsAfterClear);
    if (payload.events.length > 0 && newEvents.length === 0) {
      await pruneExpiredReadingEvents(now);
      return;
    }

    const batchPayload = { ...payload, events: newEvents };
    const existingChunks = new Map<string, TextChunkRecord | undefined>();
    const existingSessionChunks = new Map<string, ChunkSessionRecord | undefined>();
    const existingDayChunks = new Map<string, ChunkDayRecord | undefined>();
    const eventDates = getEventDates(batchPayload);
    const sessionId = batchPayload.events[0]?.sessionId;
    const chunkStates = new Map<string, ChunkReadingState>();
    const chunkDayStates = new Map<string, Map<string, ChunkDayReadingState>>();
    const pageLanguage = normalizeReadingPaceLanguage(batchPayload.page.language);
    const readingPaceProfile = await db.readingPaceProfiles.get(createReadingPaceProfileId(pageLanguage, DEFAULT_READING_CONTENT_TYPE));
    const baseWordsPerMinute = resolveReadingPaceBaseWordsPerMinute(readingPaceProfile);

    for (const chunk of payload.chunks) {
      const existingChunk = await db.textChunks.get(chunk.chunkId);
      const existingSessionChunk = sessionId ? await db.chunkSessions.get(createChunkSessionId(sessionId, chunk.chunkId)) : undefined;
      existingChunks.set(chunk.chunkId, existingChunk);
      existingSessionChunks.set(chunk.chunkId, existingSessionChunk);
      chunkStates.set(chunk.chunkId, {
        sessionEffectiveWords: existingSessionChunk?.effectiveWords ?? 0,
        todayEffectiveWords: 0,
        lifetimeEffectiveWords: existingChunk?.effectiveWords ?? 0,
      });

      for (const date of eventDates) {
        const existingDayChunk = await db.chunkDays.get(createChunkDayId(date, chunk.chunkId));
        existingDayChunks.set(createChunkDayId(date, chunk.chunkId), existingDayChunk);
        const dayStates = chunkDayStates.get(date) ?? new Map();
        dayStates.set(chunk.chunkId, {
          effectiveWords: existingDayChunk?.effectiveWords ?? 0,
        });
        chunkDayStates.set(date, dayStates);
      }
    }

    const summary = summarizeReadingEventBatch(batchPayload, { chunkStates, chunkDayStates, baseWordsPerMinute });
    const chunkUpdatesById = new Map(summary.chunkUpdates.map((update) => [update.chunkId, update]));

    const existingPage = await db.pages.get(payload.page.pageId);

    const chunkRecords: TextChunkRecord[] = [];
    for (const chunk of payload.chunks) {
      const existingChunk = existingChunks.get(chunk.chunkId);
      const update = chunkUpdatesById.get(chunk.chunkId);
      const priorLifetimeEffectiveWords = existingChunk?.effectiveWords ?? 0;
      const nextLifetimeEffectiveWords = Math.min(chunk.wordCount, priorLifetimeEffectiveWords + (update?.newWords ?? 0));
      const priorRawExposureMs = existingChunk?.rawExposureMs ?? (existingChunk?.exposureSeconds ?? 0) * 1_000;
      const nextRawExposureMs = priorRawExposureMs + (update?.rawExposureMs ?? 0);
      chunkRecords.push({
        chunkId: chunk.chunkId,
        pageId: chunk.pageId,
        textHash: chunk.textHash,
        wordCount: chunk.wordCount,
        sentenceCount: chunk.sentenceCount,
        difficulty: existingChunk?.difficulty ?? 0,
        exposureSeconds: nextRawExposureMs / 1_000,
        rawExposureMs: nextRawExposureMs,
        effectiveReadingMs: (existingChunk?.effectiveReadingMs ?? 0) + (update?.effectiveReadingMs ?? 0),
        effectiveWords: nextLifetimeEffectiveWords,
        newWords: (existingChunk?.newWords ?? 0) + (update?.newWords ?? 0),
        reviewWords: (existingChunk?.reviewWords ?? 0) + (update?.reviewWords ?? 0),
        confidence: weightedAverageConfidence(
          existingChunk?.confidence ?? 0,
          existingChunk?.effectiveWords ?? 0,
          update?.confidence ?? 0,
          update?.effectiveWords ?? 0,
        ),
      });
    }
    const vocabUpdates = payload.chunks.flatMap((chunk) => {
      const update = chunkUpdatesById.get(chunk.chunkId);
      if (!chunk.text || !update || update.effectiveWords <= 0) return [];
      return extractVocabExposureUpdates(
        chunk.text,
        update.lastEffectiveReadAt ?? summary.lastEffectiveReadAt ?? now,
        update.effectiveWords / chunk.wordCount,
      );
    });
    const lastReadAt = summary.lastEffectiveReadAt === undefined
      ? existingPage?.lastReadAt ?? Math.max(payload.page.capturedAt, dataClearedAt)
      : Math.max(existingPage?.lastReadAt ?? 0, summary.lastEffectiveReadAt);
    const incomingPageDomain = normalizeStoredDomain(payload.page.domain);
    const storedSnapshotCapturedAt = existingPage?.snapshotCapturedAt ?? existingPage?.lastReadAt;
    const shouldUpdatePageSnapshot = storedSnapshotCapturedAt === undefined
      || payload.page.capturedAt >= storedSnapshotCapturedAt;
    const pageDomain = shouldUpdatePageSnapshot ? incomingPageDomain : existingPage?.domain ?? incomingPageDomain;

    const pageRecord: PageRecord = {
      pageId: payload.page.pageId,
      domain: pageDomain,
      titleHash: shouldUpdatePageSnapshot ? payload.page.titleHash : existingPage?.titleHash ?? payload.page.titleHash,
      urlHash: shouldUpdatePageSnapshot ? payload.page.urlHash : existingPage?.urlHash ?? payload.page.urlHash,
      language: shouldUpdatePageSnapshot ? payload.page.language : existingPage?.language ?? payload.page.language,
      totalWords: shouldUpdatePageSnapshot ? payload.page.totalWords : existingPage?.totalWords ?? payload.page.totalWords,
      effectiveWords: (existingPage?.effectiveWords ?? 0) + summary.pageEffectiveWords,
      coveredWords: shouldUpdatePageSnapshot
        ? Math.min(
            payload.page.totalWords,
            chunkRecords.reduce((total, chunk) => total + chunk.effectiveWords, 0),
          )
        : existingPage?.coveredWords,
      newWords: (existingPage?.newWords ?? 0) + summary.pageNewWords,
      reviewWords: (existingPage?.reviewWords ?? 0) + summary.pageReviewWords,
      rawExposureMs: (existingPage?.rawExposureMs ?? 0) + summary.totalRawExposureMs,
      effectiveReadingMs: (existingPage?.effectiveReadingMs ?? 0) + summary.totalEffectiveReadingMs,
      confidence: mergePageConfidence(existingPage, summary.chunkUpdates),
      difficultyScore: existingPage?.difficultyScore ?? 0,
      firstSeenAt: existingPage?.firstSeenAt ?? Math.max(payload.page.capturedAt, dataClearedAt),
      lastReadAt,
      snapshotCapturedAt: shouldUpdatePageSnapshot ? payload.page.capturedAt : existingPage?.snapshotCapturedAt,
    };

    await db.pages.put(pageRecord);
    if (chunkRecords.length > 0) {
      await db.textChunks.bulkPut(chunkRecords);
    }
    if (newEvents.length > 0) {
      await db.readingEvents.bulkPut(newEvents);
    }
    await recordChunkCapIncrements(summary, existingSessionChunks, existingDayChunks, sessionId);
    await recordDailyStatIncrements(summary.dailyUpdates, pageDomain);
    await recordAdaptiveReadingPaceSample(batchPayload, readingPaceProfile, baseWordsPerMinute, pageLanguage, now);

    for (const update of vocabUpdates) {
      const existing = await db.vocabExposures.get(update.lemma);
      if (existing?.userStatus === 'ignored') {
        continue;
      }

      await db.vocabExposures.put(
        existing
          ? {
              ...existing,
              seenCount: existing.seenCount + update.seenCount,
              effectiveSeenCount: existing.effectiveSeenCount + update.effectiveSeenCount,
              lastSeenAt: Math.max(existing.lastSeenAt, update.lastSeenAt),
              packTags: mergeTags(existing.packTags, update.packTags),
            }
          : update,
      );
    }

    await pruneExpiredReadingEvents(now);
  });
}

async function getNewReadingEvents(events: ReadingEvent[]): Promise<ReadingEvent[]> {
  if (events.length === 0) {
    return [];
  }

  const existingEvents = await db.readingEvents.bulkGet(events.map((event) => event.id));
  const existingEventIds = new Set(
    existingEvents.filter((event): event is NonNullable<typeof event> => Boolean(event)).map((event) => event.id),
  );
  const seenIncomingEventIds = new Set<string>();

  return events.filter((event) => {
    if (existingEventIds.has(event.id) || seenIncomingEventIds.has(event.id)) {
      return false;
    }

    seenIncomingEventIds.add(event.id);
    return true;
  });
}

function normalizeEventAfterClear(event: ReadingEvent, dataClearedAt: number): ReadingEvent[] {
  if (event.occurredAt <= dataClearedAt) {
    return [];
  }

  if (dataClearedAt <= 0 || event.kind !== 'TextViewportExposureTick') {
    return [event];
  }

  const value = readObject(event.value);
  const tickMs = readPositiveNumber(value, 'tickMs');
  const elapsedAfterClear = event.occurredAt - dataClearedAt;
  if (tickMs <= elapsedAfterClear) {
    return [event];
  }

  return [{
    ...event,
    value: {
      ...value,
      tickMs: elapsedAfterClear,
    },
  }];
}

export async function pruneExpiredReadingEvents(now = Date.now()): Promise<void> {
  await db.readingEvents.where('occurredAt').below(now - READING_EVENT_RETENTION_MS).delete();
}

export async function clearLocalReadingData(clearedAt = Date.now()): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.pages,
      db.textChunks,
      db.chunkSessions,
      db.chunkDays,
      db.readingEvents,
      db.vocabExposures,
      db.savedItems,
      db.dailyStats,
      db.readingPaceProfiles,
      db.metadata,
    ],
    async () => {
      const existingClearedAt = (await db.metadata.get(READING_DATA_CLEARED_AT_KEY))?.numberValue ?? 0;
      const nextClearedAt = Math.max(existingClearedAt, clearedAt);
      await Promise.all([
        db.pages.clear(),
        db.textChunks.clear(),
        db.chunkSessions.clear(),
        db.chunkDays.clear(),
        db.readingEvents.clear(),
        db.vocabExposures.clear(),
        db.savedItems.clear(),
        db.dailyStats.clear(),
        db.readingPaceProfiles.clear(),
      ]);
      await db.metadata.put({
        key: READING_DATA_CLEARED_AT_KEY,
        numberValue: nextClearedAt,
      });
    },
  );
}

async function recordAdaptiveReadingPaceSample(
  payload: ReadingEventBatchPayload,
  existingProfile: ReadingPaceProfileRecord | undefined,
  baseWordsPerMinute: number,
  language: string,
  now: number,
): Promise<void> {
  const sample = createAdaptiveReadingPaceSample(payload, baseWordsPerMinute);
  const nextProfile = updateAdaptiveReadingPaceProfile(existingProfile, sample, {
    language,
    contentType: DEFAULT_READING_CONTENT_TYPE,
    now,
  });

  if (nextProfile) {
    await db.readingPaceProfiles.put(nextProfile);
  }
}

async function recordDailyStatIncrements(
  updates: ReturnType<typeof summarizeReadingEventBatch>['dailyUpdates'],
  domain: string,
): Promise<void> {
  for (const update of updates) {
    const existing = await db.dailyStats.get(update.date);
    const effectiveWords = (existing?.effectiveWords ?? 0) + update.effectiveWords;
    const effectiveReadingMs = (existing?.effectiveReadingMs ?? 0) + update.effectiveReadingMs;
    const hasReading = effectiveWords > 0 || effectiveReadingMs > 0;
    const streak = hasReading
      ? existing && hasMeasuredDailyReading(existing) && existing.streak > 0
        ? existing.streak
        : (await getStoredReadingStreakEndingOn(previousLocalDate(update.date))) + 1
      : 0;
    await db.dailyStats.put({
      date: update.date,
      effectiveWords,
      newWords: (existing?.newWords ?? 0) + update.newWords,
      reviewWords: (existing?.reviewWords ?? 0) + update.reviewWords,
      minutes: (existing?.minutes ?? 0) + update.minutes,
      rawExposureMs: (existing?.rawExposureMs ?? 0) + update.rawExposureMs,
      effectiveReadingMs,
      advancedWords: existing?.advancedWords ?? 0,
      expressions: existing?.expressions ?? 0,
      streak,
      topDomains: mergeTopDomains(existing?.topDomains ?? [], domain),
    });
    await repairFollowingReadingStreaks(update.date, streak);
  }
}

async function repairFollowingReadingStreaks(date: string, priorStreak: number): Promise<void> {
  let cursor = nextLocalDate(date);
  let streak = priorStreak;

  while (true) {
    const dailyStat = await db.dailyStats.get(cursor);
    if (!dailyStat || !hasMeasuredDailyReading(dailyStat)) {
      return;
    }

    streak += 1;
    if (dailyStat.streak !== streak) {
      await db.dailyStats.put({ ...dailyStat, streak });
    }
    cursor = nextLocalDate(cursor);
  }
}

async function getStoredReadingStreakEndingOn(date: string): Promise<number> {
  const endingDay = await db.dailyStats.get(date);
  if (!endingDay || !hasMeasuredDailyReading(endingDay)) {
    return 0;
  }
  if (endingDay.streak > 0) {
    return endingDay.streak;
  }

  // Version 3 wrote zero for every streak. Only those legacy rows need a
  // one-time backward scan; current rows reuse their persisted aggregate.
  let streak = 1;
  let cursor = previousLocalDate(date);

  while (true) {
    const dailyStat = await db.dailyStats.get(cursor);
    if (!dailyStat || !hasMeasuredDailyReading(dailyStat)) {
      return streak;
    }

    streak += 1;
    cursor = previousLocalDate(cursor);
  }
}

function hasMeasuredDailyReading(dailyStat: { effectiveWords: number; effectiveReadingMs?: number; minutes: number }): boolean {
  return dailyStat.effectiveWords > 0 || (dailyStat.effectiveReadingMs ?? 0) > 0 || dailyStat.minutes > 0;
}

function previousLocalDate(date: string): string {
  return shiftLocalDate(date, -1);
}

function nextLocalDate(date: string): string {
  return shiftLocalDate(date, 1);
}

function shiftLocalDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(year, month - 1, day);
  shifted.setDate(shifted.getDate() + days);
  return formatLocalDate(shifted.getTime());
}

async function recordChunkCapIncrements(
  summary: ReturnType<typeof summarizeReadingEventBatch>,
  existingSessionChunks: Map<string, ChunkSessionRecord | undefined>,
  existingDayChunks: Map<string, ChunkDayRecord | undefined>,
  sessionId: string | undefined,
): Promise<void> {
  if (sessionId) {
    for (const update of summary.chunkUpdates) {
      if (update.effectiveWords <= 0) {
        continue;
      }

      const existing = existingSessionChunks.get(update.chunkId);
      await db.chunkSessions.put({
        id: createChunkSessionId(sessionId, update.chunkId),
        sessionId,
        chunkId: update.chunkId,
        effectiveWords: (existing?.effectiveWords ?? 0) + update.effectiveWords,
      });
    }
  }

  for (const update of summary.chunkDayUpdates) {
    if (update.rawExposureMs <= 0) {
      continue;
    }

    const id = createChunkDayId(update.date, update.chunkId);
    const existing = existingDayChunks.get(id);
    await db.chunkDays.put({
      id,
      date: update.date,
      chunkId: update.chunkId,
      effectiveWords: (existing?.effectiveWords ?? 0) + update.effectiveWords,
      newWords: (existing?.newWords ?? 0) + update.newWords,
      reviewWords: (existing?.reviewWords ?? 0) + update.reviewWords,
      rawExposureMs: (existing?.rawExposureMs ?? 0) + update.rawExposureMs,
      effectiveReadingMs: (existing?.effectiveReadingMs ?? 0) + update.effectiveReadingMs,
    });
  }
}

function mergeTopDomains(existing: string[], domain: string): string[] {
  const normalizedExisting = existing.map(normalizeExistingTopDomain).filter((value): value is string => Boolean(value));
  return Array.from(new Set([...normalizedExisting, domain])).slice(0, 8);
}

function normalizeStoredDomain(domain: string): string {
  const normalized = domain.trim();
  return normalized || 'unknown';
}

function normalizeExistingTopDomain(domain: string): string | undefined {
  const normalized = domain.trim();
  return normalized || undefined;
}

function getEventDates(payload: ReadingEventBatchPayload): string[] {
  return Array.from(new Set(payload.events.map((event) => formatLocalDate(event.occurredAt))));
}

function createAdaptiveReadingPaceSample(
  payload: ReadingEventBatchPayload,
  baseWordsPerMinute: number,
): AdaptiveReadingPaceSample | undefined {
  if (payload.page.totalWords < MIN_ADAPTIVE_PAGE_WORDS) {
    return undefined;
  }

  const chunksById = new Map(payload.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const readableWordsByChunk = new Map<string, number>();
  let engagedMs = 0;
  let observedAt = 0;

  for (const event of payload.events) {
    if (event.kind !== 'TextViewportExposureTick' || event.confidence !== 'high') {
      continue;
    }

    const value = readObject(event.value);
    const tickMs = readPositiveNumber(value, 'tickMs');
    if (
      tickMs <= 0 ||
      !readBoolean(value, 'activeTab', true) ||
      !readBoolean(value, 'documentVisible', true) ||
      readNumber(value, 'idleAgeMs', 0) > MAX_ADAPTIVE_IDLE_MS ||
      Math.abs(readNumber(value, 'scrollSpeedWordsPerMinute', 0)) > baseWordsPerMinute * 1.6
    ) {
      continue;
    }

    let tickHasReliableVisibleChunk = false;
    for (const visibleChunk of readAdaptiveVisibleChunks(value?.visibleChunks)) {
      const chunk = chunksById.get(visibleChunk.chunkId);
      if (
        !chunk ||
        visibleChunk.visibleRatio < MIN_ADAPTIVE_VISIBLE_RATIO ||
        visibleChunk.contentWeight < MIN_ADAPTIVE_CONTENT_WEIGHT
      ) {
        continue;
      }

      const readableWords = Math.min(chunk.wordCount, Math.round(visibleChunk.wordCount)) * visibleChunk.visibleRatio;
      if (readableWords <= 0) {
        continue;
      }

      readableWordsByChunk.set(
        visibleChunk.chunkId,
        Math.max(readableWordsByChunk.get(visibleChunk.chunkId) ?? 0, readableWords),
      );
      tickHasReliableVisibleChunk = true;
    }

    if (tickHasReliableVisibleChunk) {
      engagedMs += tickMs;
      observedAt = Math.max(observedAt, event.occurredAt);
    }
  }

  const readableWords = Array.from(readableWordsByChunk.values()).reduce((sum, words) => sum + words, 0);
  if (
    readableWordsByChunk.size < MIN_ADAPTIVE_CHUNKS ||
    readableWords < MIN_ADAPTIVE_SAMPLE_WORDS ||
    engagedMs < MIN_ADAPTIVE_ENGAGED_MS
  ) {
    return undefined;
  }

  return {
    observedWordsPerMinute: (readableWords * 60_000) / engagedMs,
    confidence: Math.min(1, 0.75 + Math.min(0.25, readableWords / Math.max(1, payload.page.totalWords) * 0.25)),
    observedAt,
  };
}

function readAdaptiveVisibleChunks(value: unknown): Array<{
  chunkId: string;
  wordCount: number;
  visibleRatio: number;
  contentWeight: number;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    const visibleChunk = readObject(candidate);
    const chunkId = visibleChunk?.chunkId;
    if (typeof chunkId !== 'string' || chunkId.trim().length === 0) {
      return [];
    }

    return [
      {
        chunkId,
        wordCount: readPositiveNumber(visibleChunk, 'wordCount'),
        visibleRatio: readNumber(visibleChunk, 'visibleRatio', 0),
        contentWeight: readNumber(visibleChunk, 'contentWeight', 0),
      },
    ];
  });
}

function createChunkSessionId(sessionId: string, chunkId: string): string {
  return `${sessionId}:${chunkId}`;
}

function createChunkDayId(date: string, chunkId: string): string {
  return `${date}:${chunkId}`;
}

function weightedAverageConfidence(
  existingConfidence: number,
  existingWords: number,
  nextConfidence: number,
  nextWords: number,
): number {
  const totalWords = existingWords + nextWords;
  if (totalWords <= 0) {
    return nextConfidence;
  }

  return (existingConfidence * existingWords + nextConfidence * nextWords) / totalWords;
}

function mergePageConfidence(
  existingPage: PageRecord | undefined,
  updates: ReturnType<typeof summarizeReadingEventBatch>['chunkUpdates'],
): number | undefined {
  let weightedConfidence = 0;
  let confidenceWeight = 0;

  if (existingPage?.confidence !== undefined && existingPage.effectiveWords > 0) {
    weightedConfidence += existingPage.confidence * existingPage.effectiveWords;
    confidenceWeight += existingPage.effectiveWords;
  }

  for (const update of updates) {
    if (update.effectiveWords <= 0) continue;
    weightedConfidence += update.confidence * update.effectiveWords;
    confidenceWeight += update.effectiveWords;
  }

  return confidenceWeight > 0 ? weightedConfidence / confidenceWeight : existingPage?.confidence;
}

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumber(value: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback;
}

function readPositiveNumber(value: Record<string, unknown> | undefined, key: string): number {
  return Math.max(0, readNumber(value, key, 0));
}

function readBoolean(value: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const candidate = value?.[key];
  return typeof candidate === 'boolean' ? candidate : fallback;
}

function extractVocabExposureUpdates(text: string, now: number, coverage: number): VocabExposureRecord[] {
  const boundedCoverage = Math.min(1, Math.max(0, Number.isFinite(coverage) ? coverage : 0));
  if (boundedCoverage <= 0) {
    return [];
  }

  const counts = new Map<string, number>();
  const packTagsByLemma = collectPackTagsByLemma(text);
  const analysis = analyzeEnglishText(text);

  for (const token of analysis.tokens) {
    if (!isTrackableEnglishToken(token)) {
      continue;
    }

    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return Array.from(counts, ([lemma, seenCount]) => ({
    lemma,
    language: 'en',
    seenCount: seenCount * boundedCoverage,
    effectiveSeenCount: seenCount * boundedCoverage,
    lookupCount: 0,
    savedCount: 0,
    lastSeenAt: now,
    packTags: packTagsByLemma.get(lemma) ?? [],
    userStatus: 'new',
  }));
}

function collectPackTagsByLemma(text: string): Map<string, string[]> {
  const tagsByLemma = new Map<string, Set<string>>();

  for (const pack of ACTIVE_PACKS) {
    for (const match of matchPackRules(pack, text)) {
      for (const lemma of analyzeEnglishText(match.text).tokens) {
        if (!isTrackableEnglishToken(lemma)) {
          continue;
        }

        const tags = tagsByLemma.get(lemma) ?? new Set<string>();
        for (const tag of match.tags) {
          tags.add(tag);
        }
        tagsByLemma.set(lemma, tags);
      }
    }
  }

  return new Map(Array.from(tagsByLemma, ([lemma, tags]) => [lemma, Array.from(tags)]));
}

function mergeTags(existing: string[], next: string[]): string[] {
  return Array.from(new Set([...existing, ...next]));
}
