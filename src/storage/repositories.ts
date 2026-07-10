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
  type ReadingPaceEpisodeRecord,
  type ReadingPaceProfileRecord,
  type TextChunkRecord,
  type VocabExposureRecord,
} from './schema';
import { summarizeReadingEventBatch, type ChunkDayReadingState, type ChunkReadingState } from './aggregateReading';

const ACTIVE_PACKS: YuelPack[] = [techEnglishPack as YuelPack];
const READING_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const READING_PACE_EPISODE_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MIN_ADAPTIVE_PAGE_WORDS = 250;
const MIN_ADAPTIVE_SAMPLE_WORDS = 120;
const MIN_ADAPTIVE_ENGAGED_MS = 30_000;
const MIN_ADAPTIVE_VISIBLE_RATIO = 0.65;
const MIN_ADAPTIVE_CONTENT_MULTIPLIER = 0.95;
const MIN_ADAPTIVE_CHUNKS = 3;
const MAX_ADAPTIVE_IDLE_MS = 45_000;
const MIN_ADAPTIVE_CENTER_DWELL_MS = 1_000;
const ADAPTIVE_CENTER_BAND_TOP = 0.3;
const ADAPTIVE_CENTER_BAND_BOTTOM = 0.7;
const ADAPTIVE_COMPLETION_Y = 0.2;
const MAX_ADAPTIVE_EPISODE_MS = 10 * 60_000;
const READING_DATA_CLEARED_AT_KEY = 'readingDataClearedAt';

export async function recordReadingEventBatch(payload: ReadingEventBatchPayload): Promise<void> {
  const now = Date.now();

  await db.transaction('rw', [db.pages, db.textChunks, db.chunkSessions, db.chunkDays, db.readingEvents, db.vocabExposures, db.dailyStats, db.readingPaceProfiles, db.readingPaceEpisodes, db.metadata], async () => {
    const dataClearedAt = (await db.metadata.get(READING_DATA_CLEARED_AT_KEY))?.numberValue ?? 0;
    const eventsAfterClear = payload.events.flatMap((event) => normalizeEventAfterClear(event, dataClearedAt));
    const newEvents = await getNewReadingEvents(eventsAfterClear);
    if (payload.events.length > 0 && newEvents.length === 0) {
      await pruneExpiredReadingEvents(now);
      await pruneExpiredReadingPaceEpisodes(now);
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
    const migratedLifetimeCoverageByChunk = new Map<string, number>();
    const pageLanguage = normalizeReadingPaceLanguage(batchPayload.page.language);
    const chunkIds = payload.chunks.map((chunk) => chunk.chunkId);
    const sessionChunkIds = sessionId
      ? chunkIds.map((chunkId) => createChunkSessionId(sessionId, chunkId))
      : [];
    const dayChunkIds = eventDates.flatMap((date) =>
      chunkIds.map((chunkId) => createChunkDayId(date, chunkId)));
    const [
      readingPaceProfile,
      existingPage,
      existingChunkValues,
      existingSessionChunkValues,
      existingDayChunkValues,
    ] = await Promise.all([
      db.readingPaceProfiles.get(createReadingPaceProfileId(pageLanguage, DEFAULT_READING_CONTENT_TYPE)),
      db.pages.get(payload.page.pageId),
      db.textChunks.bulkGet(chunkIds),
      sessionId ? db.chunkSessions.bulkGet(sessionChunkIds) : Promise.resolve([]),
      dayChunkIds.length > 0 ? db.chunkDays.bulkGet(dayChunkIds) : Promise.resolve([]),
    ]);
    const baseWordsPerMinute = resolveReadingPaceBaseWordsPerMinute(readingPaceProfile);
    const incomingMetricModelVersion = payload.page.metricModelVersion ?? 1;
    const existingMetricModelVersion = existingPage?.metricModelVersion ?? 1;
    const migratedCoverageBaseline = existingPage && existingMetricModelVersion < incomingMetricModelVersion
      ? Math.min(
          payload.page.totalWords,
          Math.max(0, existingPage.coveredWords ?? Math.min(existingPage.totalWords, existingPage.effectiveWords)),
        )
      : 0;
    const migratedCoverageRatio = payload.page.totalWords > 0
      ? migratedCoverageBaseline / payload.page.totalWords
      : 0;

    const existingChunksById = new Map(chunkIds.map((chunkId, index) => [chunkId, existingChunkValues[index]]));
    const existingSessionChunksById = new Map(
      sessionChunkIds.map((id, index) => [id, existingSessionChunkValues[index]]),
    );
    const existingDayChunksById = new Map(dayChunkIds.map((id, index) => [id, existingDayChunkValues[index]]));

    for (const chunk of payload.chunks) {
      const existingChunk = existingChunksById.get(chunk.chunkId);
      const existingSessionChunk = sessionId
        ? existingSessionChunksById.get(createChunkSessionId(sessionId, chunk.chunkId))
        : undefined;
      const migratedLifetimeCoverage = existingChunk
        ? 0
        : Math.min(chunk.wordCount, chunk.wordCount * migratedCoverageRatio);
      existingChunks.set(chunk.chunkId, existingChunk);
      existingSessionChunks.set(chunk.chunkId, existingSessionChunk);
      migratedLifetimeCoverageByChunk.set(chunk.chunkId, migratedLifetimeCoverage);
      chunkStates.set(chunk.chunkId, {
        sessionEffectiveWords: existingSessionChunk?.effectiveWords ?? 0,
        todayEffectiveWords: 0,
        lifetimeEffectiveWords: existingChunk?.effectiveWords ?? migratedLifetimeCoverage,
      });

      for (const date of eventDates) {
        const existingDayChunk = existingDayChunksById.get(createChunkDayId(date, chunk.chunkId));
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

    const chunkRecords: TextChunkRecord[] = [];
    let measuredCurrentCoverage = 0;
    for (const chunk of payload.chunks) {
      const existingChunk = existingChunks.get(chunk.chunkId);
      const update = chunkUpdatesById.get(chunk.chunkId);
      const priorLifetimeEffectiveWords = existingChunk?.effectiveWords
        ?? migratedLifetimeCoverageByChunk.get(chunk.chunkId)
        ?? 0;
      const nextLifetimeEffectiveWords = Math.min(chunk.wordCount, priorLifetimeEffectiveWords + (update?.newWords ?? 0));
      const priorRawExposureMs = existingChunk?.rawExposureMs ?? (existingChunk?.exposureSeconds ?? 0) * 1_000;
      const nextRawExposureMs = priorRawExposureMs + (update?.rawExposureMs ?? 0);
      const nextMetricModelVersion = Math.max(existingChunk?.metricModelVersion ?? 1, incomingMetricModelVersion);
      const nextChunkRecord: TextChunkRecord = {
        chunkId: chunk.chunkId,
        pageId: chunk.pageId,
        textHash: chunk.textHash,
        wordCount: chunk.wordCount,
        metricModelVersion: nextMetricModelVersion,
        sentenceCount: chunk.sentenceCount,
        difficulty: existingChunk?.difficulty ?? 0,
        exposureSeconds: nextRawExposureMs / 1_000,
        rawExposureMs: nextRawExposureMs,
        effectiveReadingMs: (existingChunk?.effectiveReadingMs ?? 0) + (update?.effectiveReadingMs ?? 0),
        effectiveWords: nextLifetimeEffectiveWords,
        newWords: (existingChunk?.newWords ?? priorLifetimeEffectiveWords) + (update?.newWords ?? 0),
        reviewWords: (existingChunk?.reviewWords ?? 0) + (update?.reviewWords ?? 0),
        confidence: weightedAverageConfidence(
          existingChunk?.confidence ?? existingPage?.confidence ?? 0,
          priorLifetimeEffectiveWords,
          update?.confidence ?? 0,
          update?.effectiveWords ?? 0,
        ),
      };
      measuredCurrentCoverage += nextLifetimeEffectiveWords;
      if (
        !existingChunk ||
        update ||
        (existingChunk.metricModelVersion ?? 1) !== nextMetricModelVersion
      ) {
        chunkRecords.push(nextChunkRecord);
      }
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
    measuredCurrentCoverage = Math.min(payload.page.totalWords, measuredCurrentCoverage);
    const pageRecord: PageRecord = {
      pageId: payload.page.pageId,
      domain: pageDomain,
      titleHash: shouldUpdatePageSnapshot ? payload.page.titleHash : existingPage?.titleHash ?? payload.page.titleHash,
      urlHash: shouldUpdatePageSnapshot ? payload.page.urlHash : existingPage?.urlHash ?? payload.page.urlHash,
      language: shouldUpdatePageSnapshot ? payload.page.language : existingPage?.language ?? payload.page.language,
      totalWords: shouldUpdatePageSnapshot ? payload.page.totalWords : existingPage?.totalWords ?? payload.page.totalWords,
      metricModelVersion: shouldUpdatePageSnapshot
        ? Math.max(existingMetricModelVersion, incomingMetricModelVersion)
        : existingPage?.metricModelVersion ?? incomingMetricModelVersion,
      effectiveWords: (existingPage?.effectiveWords ?? 0) + summary.pageEffectiveWords,
      coveredWords: shouldUpdatePageSnapshot
        ? Math.min(
            payload.page.totalWords,
            Math.max(measuredCurrentCoverage, migratedCoverageBaseline),
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
    await recordDailyStatIncrements(summary.dailyUpdates, pageDomain, incomingMetricModelVersion);
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
    await pruneExpiredReadingPaceEpisodes(now);
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

export async function pruneExpiredReadingPaceEpisodes(now = Date.now()): Promise<void> {
  await db.readingPaceEpisodes.where('lastObservedAt').below(now - READING_PACE_EPISODE_RETENTION_MS).delete();
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
      db.readingPaceEpisodes,
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
        db.readingPaceEpisodes.clear(),
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
  const sessionId = payload.events[0]?.sessionId;
  if (!sessionId || payload.page.totalWords < MIN_ADAPTIVE_PAGE_WORDS) {
    return;
  }

  const episodeId = createReadingPaceEpisodeId(sessionId, payload.page.pageId);
  const storedEpisode = await db.readingPaceEpisodes.get(episodeId);
  const existingEpisode = storedEpisode
    && storedEpisode.lastObservedAt >= now - READING_PACE_EPISODE_RETENTION_MS
    ? storedEpisode
    : undefined;
  const { episode, sample, ended } = advanceAdaptiveReadingPaceEpisode(
    payload,
    existingEpisode,
    baseWordsPerMinute,
    language,
  );

  if (ended) {
    await db.readingPaceEpisodes.delete(episodeId);
  } else {
    await db.readingPaceEpisodes.put(episode);
  }

  if (!sample) {
    return;
  }

  const recentAdaptiveWordsPerMinute = [
    ...(existingProfile?.recentAdaptiveWordsPerMinute ?? []),
    sample.observedWordsPerMinute,
  ].slice(-5);
  if (recentAdaptiveWordsPerMinute.length < 3) {
    await db.readingPaceProfiles.put(createProfileWithBufferedAdaptiveHistory(
      existingProfile,
      language,
      baseWordsPerMinute,
      recentAdaptiveWordsPerMinute,
      now,
    ));
    return;
  }

  const medianObservedWordsPerMinute = median(recentAdaptiveWordsPerMinute);
  const nextProfile = updateAdaptiveReadingPaceProfile(existingProfile, {
    ...sample,
    observedWordsPerMinute: medianObservedWordsPerMinute,
  }, {
    language,
    contentType: DEFAULT_READING_CONTENT_TYPE,
    now,
  });

  if (nextProfile) {
    await db.readingPaceProfiles.put({
      ...nextProfile,
      recentAdaptiveWordsPerMinute,
    });
  } else {
    await db.readingPaceProfiles.put(createProfileWithBufferedAdaptiveHistory(
      existingProfile,
      language,
      baseWordsPerMinute,
      recentAdaptiveWordsPerMinute,
      now,
    ));
  }
}

function createProfileWithBufferedAdaptiveHistory(
  existingProfile: ReadingPaceProfileRecord | undefined,
  language: string,
  baseWordsPerMinute: number,
  recentAdaptiveWordsPerMinute: number[],
  now: number,
): ReadingPaceProfileRecord {
  if (existingProfile) {
    return {
      ...existingProfile,
      recentAdaptiveWordsPerMinute,
    };
  }

  return {
    id: createReadingPaceProfileId(language, DEFAULT_READING_CONTENT_TYPE),
    language,
    contentType: DEFAULT_READING_CONTENT_TYPE,
    baseWordsPerMinute,
    sampleCount: 0,
    source: 'default',
    recentAdaptiveWordsPerMinute,
    updatedAt: now,
  };
}

async function recordDailyStatIncrements(
  updates: ReturnType<typeof summarizeReadingEventBatch>['dailyUpdates'],
  domain: string,
  metricModelVersion: number,
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
      metricModelVersion: Math.max(existing?.metricModelVersion ?? 1, metricModelVersion),
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

interface AdaptiveEpisodeAdvanceResult {
  episode: ReadingPaceEpisodeRecord;
  sample?: AdaptiveReadingPaceSample;
  ended: boolean;
}

function advanceAdaptiveReadingPaceEpisode(
  payload: ReadingEventBatchPayload,
  existingEpisode: ReadingPaceEpisodeRecord | undefined,
  baseWordsPerMinute: number,
  language: string,
): AdaptiveEpisodeAdvanceResult {
  const sessionId = payload.events[0]?.sessionId ?? existingEpisode?.sessionId ?? 'unknown';
  const startedAt = existingEpisode?.startedAt ?? payload.events[0]?.occurredAt ?? payload.page.capturedAt;
  const episode: ReadingPaceEpisodeRecord = existingEpisode
    ? {
        ...existingEpisode,
        completedSegmentIds: [...existingEpisode.completedSegmentIds],
        segmentStates: Object.fromEntries(
          Object.entries(existingEpisode.segmentStates).map(([chunkId, state]) => [chunkId, { ...state }]),
        ),
      }
    : {
        id: createReadingPaceEpisodeId(sessionId, payload.page.pageId),
        sessionId,
        pageId: payload.page.pageId,
        language,
        startedAt,
        lastObservedAt: startedAt,
        activeMs: 0,
        completedWords: 0,
        completedSegmentIds: [],
        segmentStates: {},
        lastScrollDirection: 0,
      };
  const chunksById = new Map(payload.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const completedSegmentIds = new Set(episode.completedSegmentIds);
  let ended = false;

  for (const event of payload.events) {
    if (event.kind === 'ScrollVelocityChanged') {
      const value = readObject(event.value);
      const direction = readScrollDirection(value);
      const scrollSpeedWordsPerMinute = readNumber(value, 'scrollSpeedWordsPerMinute', 0);
      if (direction < 0 || scrollSpeedWordsPerMinute > baseWordsPerMinute * 1.6) {
        ended = true;
        break;
      }
      if (direction > 0) episode.lastScrollDirection = direction;
      continue;
    }

    if (event.kind === 'PageHidden' || event.kind === 'UserIdle') {
      ended = true;
      break;
    }

    if (event.kind !== 'TextViewportExposureTick') {
      continue;
    }

    const value = readObject(event.value);
    const tickMs = readPositiveNumber(value, 'tickMs');
    const tickDirection = readScrollDirection(value);
    if (
      tickMs <= 0 ||
      !readBoolean(value, 'activeTab', true) ||
      !readBoolean(value, 'documentVisible', true) ||
      readNumber(value, 'idleAgeMs', 0) > MAX_ADAPTIVE_IDLE_MS ||
      Math.abs(readNumber(value, 'scrollSpeedWordsPerMinute', 0)) > baseWordsPerMinute * 1.6 ||
      tickDirection < 0
    ) {
      ended = true;
      break;
    }
    if (tickDirection > 0) episode.lastScrollDirection = tickDirection;

    const reliableVisibleChunks = readAdaptiveVisibleChunks(value?.visibleChunks).filter((visibleChunk) => (
      chunksById.has(visibleChunk.chunkId) &&
      visibleChunk.visibleRatio >= MIN_ADAPTIVE_VISIBLE_RATIO &&
      visibleChunk.contentMultiplier >= MIN_ADAPTIVE_CONTENT_MULTIPLIER &&
      Number.isFinite(visibleChunk.viewportY)
    ));
    if (reliableVisibleChunks.length === 0) {
      continue;
    }

    episode.activeMs += tickMs;
    episode.lastObservedAt = Math.max(episode.lastObservedAt, event.occurredAt);
    const visibleChunkIds = new Set(reliableVisibleChunks.map((visibleChunk) => visibleChunk.chunkId));

    if (episode.lastScrollDirection > 0) {
      for (const [chunkId, state] of Object.entries(episode.segmentStates)) {
        if (
          !visibleChunkIds.has(chunkId) &&
          !completedSegmentIds.has(chunkId) &&
          state.centerDwellMs >= MIN_ADAPTIVE_CENTER_DWELL_MS &&
          state.lastViewportY <= ADAPTIVE_CENTER_BAND_TOP
        ) {
          completeAdaptiveSegment(episode, completedSegmentIds, chunkId, state.wordCount);
        }
      }
    }

    for (const visibleChunk of reliableVisibleChunks) {
      const chunk = chunksById.get(visibleChunk.chunkId);
      if (!chunk || completedSegmentIds.has(visibleChunk.chunkId)) continue;

      const state = episode.segmentStates[visibleChunk.chunkId] ?? {
        wordCount: chunk.wordCount,
        centerDwellMs: 0,
        lastViewportY: visibleChunk.viewportY,
        lastSeenAt: event.occurredAt,
      };
      if (
        visibleChunk.viewportY >= ADAPTIVE_CENTER_BAND_TOP &&
        visibleChunk.viewportY <= ADAPTIVE_CENTER_BAND_BOTTOM
      ) {
        state.centerDwellMs += tickMs;
      }
      state.lastViewportY = visibleChunk.viewportY;
      state.lastSeenAt = event.occurredAt;
      episode.segmentStates[visibleChunk.chunkId] = state;

      if (
        episode.lastScrollDirection > 0 &&
        visibleChunk.viewportY <= ADAPTIVE_COMPLETION_Y &&
        state.centerDwellMs >= MIN_ADAPTIVE_CENTER_DWELL_MS
      ) {
        completeAdaptiveSegment(episode, completedSegmentIds, visibleChunk.chunkId, state.wordCount);
      }
    }

    if (episode.activeMs >= MAX_ADAPTIVE_EPISODE_MS) {
      ended = true;
      break;
    }
  }

  episode.completedSegmentIds = Array.from(completedSegmentIds);
  const sample = ended ? createAdaptiveReadingPaceEpisodeSample(episode, payload.page.totalWords) : undefined;
  return { episode, sample, ended };
}

function completeAdaptiveSegment(
  episode: ReadingPaceEpisodeRecord,
  completedSegmentIds: Set<string>,
  chunkId: string,
  wordCount: number,
): void {
  if (completedSegmentIds.has(chunkId)) return;
  completedSegmentIds.add(chunkId);
  episode.completedWords += Math.max(0, wordCount);
}

function createAdaptiveReadingPaceEpisodeSample(
  episode: ReadingPaceEpisodeRecord,
  pageWordCount: number,
): AdaptiveReadingPaceSample | undefined {
  if (
    episode.completedSegmentIds.length < MIN_ADAPTIVE_CHUNKS ||
    episode.completedWords < MIN_ADAPTIVE_SAMPLE_WORDS ||
    episode.activeMs < MIN_ADAPTIVE_ENGAGED_MS
  ) {
    return undefined;
  }

  return {
    observedWordsPerMinute: episode.completedWords * 60_000 / episode.activeMs,
    confidence: Math.min(1, 0.75 + episode.completedWords / Math.max(1, pageWordCount) * 0.25),
    observedAt: episode.lastObservedAt,
  };
}

function readAdaptiveVisibleChunks(value: unknown): Array<{
  chunkId: string;
  wordCount: number;
  visibleRatio: number;
  contentMultiplier: number;
  viewportY: number;
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
        contentMultiplier: readNumber(
          visibleChunk,
          'contentMultiplier',
          readNumber(visibleChunk, 'contentWeight', 0),
        ),
        viewportY: readNumber(visibleChunk, 'viewportY', Number.NaN),
      },
    ];
  });
}

function createReadingPaceEpisodeId(sessionId: string, pageId: string): string {
  return `${sessionId}:${pageId}`;
}

function readScrollDirection(value: Record<string, unknown> | undefined): -1 | 0 | 1 {
  const direction = value?.scrollDirection;
  return direction === -1 || direction === 1 ? direction : 0;
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
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
