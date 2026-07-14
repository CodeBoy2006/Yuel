import { analyzeEnglishText, isTrackableEnglishToken } from '../analysis/english';
import { hasCompletedDailyCheckIn } from '../domain/checkIn';
import type { PageSnapshot, ReadingEvent } from '../domain/events';
import { formatLocalDate, shiftLocalDate } from '../domain/localDate';
import { weightedAverageConfidence } from '../domain/metrics';
import { matchPackRules, type YuelPack } from '../domain/packs';
import {
  DEFAULT_READING_CONTENT_TYPE,
  createReadingPaceProfileId,
  normalizeReadingPaceLanguage,
  resolveReadingPaceBaseWordsPerMinute,
  updateAdaptiveReadingPaceProfile,
  type AdaptiveReadingPaceSample,
} from '../domain/readingPace';
import { decodeViewportExposureTick } from '../domain/viewportExposure';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import techEnglishPack from '../packs/tech-english.pack.json';
import { getDailyCheckInThresholdWords } from './checkInSettings';
import {
  db,
  type ChunkDayRecord,
  type ChunkSessionRecord,
  type PageRecord,
  type ReadingPaceEpisodeRecord,
  type ReadingPaceProfileRecord,
  type ReadingSessionRecord,
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
const READING_SESSION_MERGE_GAP_MS = 5 * 60_000;
const READING_DATA_CLEARED_AT_KEY = 'readingDataClearedAt';

export async function recordReadingEventBatch(payload: ReadingEventBatchPayload): Promise<void> {
  const now = Date.now();

  await db.transaction('rw', [
    db.pages,
    db.textChunks,
    db.chunkSessions,
    db.chunkDays,
    db.readingEvents,
    db.readingSessions,
    db.vocabExposures,
    db.dailyStats,
    db.readingPaceProfiles,
    db.readingPaceEpisodes,
    db.metadata,
  ], async () => {
    const dataClearedAt = (await db.metadata.get(READING_DATA_CLEARED_AT_KEY))?.numberValue ?? 0;
    const eventsAfterClear = payload.events.flatMap((event) => normalizeEventAfterClear(event, dataClearedAt));
    const newEvents = await getNewReadingEvents(eventsAfterClear);
    if (payload.events.length > 0 && newEvents.length === 0) {
      await pruneExpiredReadingEvents(now);
      await pruneExpiredReadingPaceEpisodes(now);
      return;
    }

    const batchPayload = { ...payload, events: newEvents };
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
      existingReadingSessionRecords,
    ] = await Promise.all([
      db.readingPaceProfiles.get(createReadingPaceProfileId(pageLanguage, DEFAULT_READING_CONTENT_TYPE)),
      db.pages.get(payload.page.pageId),
      db.textChunks.bulkGet(chunkIds),
      sessionId ? db.chunkSessions.bulkGet(sessionChunkIds) : Promise.resolve([]),
      dayChunkIds.length > 0 ? db.chunkDays.bulkGet(dayChunkIds) : Promise.resolve([]),
      sessionId
        ? db.readingSessions.where('sessionId').equals(sessionId).toArray()
        : Promise.resolve([]),
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

    const existingChunks = new Map(chunkIds.map((chunkId, index) => [chunkId, existingChunkValues[index]]));
    const existingSessionChunks = new Map(chunkIds.map((chunkId, index) => [chunkId, existingSessionChunkValues[index]]));
    const existingDayChunks = new Map(dayChunkIds.map((id, index) => [id, existingDayChunkValues[index]]));

    for (const chunk of payload.chunks) {
      const existingChunk = existingChunks.get(chunk.chunkId);
      const existingSessionChunk = existingSessionChunks.get(chunk.chunkId);
      const migratedLifetimeCoverage = existingChunk
        ? 0
        : Math.min(chunk.wordCount, chunk.wordCount * migratedCoverageRatio);
      migratedLifetimeCoverageByChunk.set(chunk.chunkId, migratedLifetimeCoverage);
      chunkStates.set(chunk.chunkId, {
        sessionEffectiveWords: existingSessionChunk?.effectiveWords ?? 0,
        todayEffectiveWords: 0,
        lifetimeEffectiveWords: existingChunk?.effectiveWords ?? migratedLifetimeCoverage,
      });

      for (const date of eventDates) {
        const existingDayChunk = existingDayChunks.get(createChunkDayId(date, chunk.chunkId));
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
        sectionId: chunk.sectionId ?? existingChunk?.sectionId,
        textHash: chunk.textHash,
        wordCount: chunk.wordCount,
        metricModelVersion: nextMetricModelVersion,
        sentenceCount: chunk.sentenceCount,
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
    const updatedPageCoverage = resolveUpdatedPageCoverage(
      payload.page,
      existingPage,
      measuredCurrentCoverage,
      migratedCoverageBaseline,
      summary.pageNewWords,
    );
    const pageRecord: PageRecord = {
      pageId: payload.page.pageId,
      domain: pageDomain,
      resourceType: shouldUpdatePageSnapshot
        ? payload.page.resourceType
        : existingPage?.resourceType ?? payload.page.resourceType,
      resourceId: shouldUpdatePageSnapshot
        ? payload.page.resourceId
        : existingPage?.resourceId ?? payload.page.resourceId,
      titleHash: shouldUpdatePageSnapshot ? payload.page.titleHash : existingPage?.titleHash ?? payload.page.titleHash,
      urlHash: shouldUpdatePageSnapshot ? payload.page.urlHash : existingPage?.urlHash ?? payload.page.urlHash,
      language: shouldUpdatePageSnapshot ? payload.page.language : existingPage?.language ?? payload.page.language,
      totalWords: shouldUpdatePageSnapshot ? payload.page.totalWords : existingPage?.totalWords ?? payload.page.totalWords,
      metricModelVersion: shouldUpdatePageSnapshot
        ? Math.max(existingMetricModelVersion, incomingMetricModelVersion)
        : existingPage?.metricModelVersion ?? incomingMetricModelVersion,
      effectiveWords: (existingPage?.effectiveWords ?? 0) + summary.pageEffectiveWords,
      coveredWords: shouldUpdatePageSnapshot
        ? updatedPageCoverage
        : existingPage?.coveredWords,
      newWords: (existingPage?.newWords ?? 0) + summary.pageNewWords,
      reviewWords: (existingPage?.reviewWords ?? 0) + summary.pageReviewWords,
      rawExposureMs: (existingPage?.rawExposureMs ?? 0) + summary.totalRawExposureMs,
      effectiveReadingMs: (existingPage?.effectiveReadingMs ?? 0) + summary.totalEffectiveReadingMs,
      confidence: mergePageConfidence(existingPage, summary.chunkUpdates),
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
    await recordReadingSessionUpdates(summary.sessionUpdates, existingReadingSessionRecords, pageRecord);
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
      db.readingSessions,
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
        db.readingSessions.clear(),
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
  const checkInThresholdWords = await getDailyCheckInThresholdWords(db);

  for (const update of updates) {
    const existing = await db.dailyStats.get(update.date);
    const effectiveWords = (existing?.effectiveWords ?? 0) + update.effectiveWords;
    const effectiveReadingMs = (existing?.effectiveReadingMs ?? 0) + update.effectiveReadingMs;
    const checkInCompleted = hasCompletedDailyCheckIn({ effectiveWords }, checkInThresholdWords);
    const streak = checkInCompleted
      ? existing
        && existing.checkInThresholdWords === checkInThresholdWords
        && hasCompletedDailyCheckIn(existing, checkInThresholdWords)
        && existing.streak > 0
        ? existing.streak
        : (await getStoredReadingStreakEndingOn(shiftLocalDate(update.date, -1), checkInThresholdWords)) + 1
      : 0;
    await db.dailyStats.put({
      date: update.date,
      effectiveWords,
      checkInThresholdWords,
      metricModelVersion: Math.max(existing?.metricModelVersion ?? 1, metricModelVersion),
      newWords: (existing?.newWords ?? 0) + update.newWords,
      reviewWords: (existing?.reviewWords ?? 0) + update.reviewWords,
      minutes: (existing?.minutes ?? 0) + update.minutes,
      rawExposureMs: (existing?.rawExposureMs ?? 0) + update.rawExposureMs,
      effectiveReadingMs,
      streak,
      topDomains: mergeTopDomains(existing?.topDomains ?? [], domain),
    });
    await repairFollowingReadingStreaks(update.date, streak, checkInThresholdWords);
  }
}

async function repairFollowingReadingStreaks(
  date: string,
  priorStreak: number,
  checkInThresholdWords: number,
): Promise<void> {
  let cursor = shiftLocalDate(date, 1);
  let streak = priorStreak;

  while (true) {
    const dailyStat = await db.dailyStats.get(cursor);
    if (!dailyStat) {
      return;
    }

    const checkInCompleted = hasCompletedDailyCheckIn(dailyStat, checkInThresholdWords);
    const nextStreak = checkInCompleted ? streak + 1 : 0;
    if (
      dailyStat.checkInThresholdWords !== checkInThresholdWords
      || dailyStat.streak !== nextStreak
    ) {
      await db.dailyStats.put({
        ...dailyStat,
        checkInThresholdWords,
        streak: nextStreak,
      });
    }
    if (!checkInCompleted) {
      return;
    }

    streak = nextStreak;
    cursor = shiftLocalDate(cursor, 1);
  }
}

async function getStoredReadingStreakEndingOn(
  date: string,
  checkInThresholdWords: number,
): Promise<number> {
  const endingDay = await db.dailyStats.get(date);
  if (!endingDay || !hasCompletedDailyCheckIn(endingDay, checkInThresholdWords)) {
    return 0;
  }
  if (endingDay.checkInThresholdWords === checkInThresholdWords && endingDay.streak > 0) {
    return endingDay.streak;
  }

  // Legacy rows predate configurable goals. Rebuild their streak against the
  // active goal instead of trusting a value produced by the old any-reading rule.
  let streak = 1;
  let cursor = shiftLocalDate(date, -1);

  while (true) {
    const dailyStat = await db.dailyStats.get(cursor);
    if (!dailyStat || !hasCompletedDailyCheckIn(dailyStat, checkInThresholdWords)) {
      return streak;
    }

    streak += 1;
    cursor = shiftLocalDate(cursor, -1);
  }
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

async function recordReadingSessionUpdates(
  updates: ReturnType<typeof summarizeReadingEventBatch>['sessionUpdates'],
  existingRecords: ReadingSessionRecord[],
  page: PageRecord,
): Promise<void> {
  const records = existingRecords.map((record) => ({ ...record }));
  const changedRecords = new Map<string, ReadingSessionRecord>();

  for (const update of updates
    .filter((candidate) => candidate.effectiveReadingMs > 0)
    .sort((left, right) => left.startedAt - right.startedAt)) {
    let matchingRecord: ReadingSessionRecord | undefined;
    let matchingGap = Number.POSITIVE_INFINITY;

    for (const record of records) {
      if (
        record.sessionId !== update.sessionId
        || record.date !== update.date
        || record.pageId !== page.pageId
      ) {
        continue;
      }

      const intervalGap = getReadingSessionIntervalGap(record, update);
      if (intervalGap <= READING_SESSION_MERGE_GAP_MS && intervalGap < matchingGap) {
        matchingRecord = record;
        matchingGap = intervalGap;
      }
    }

    if (matchingRecord) {
      const existingEffectiveReadingMs = matchingRecord.effectiveReadingMs;
      matchingRecord.startedAt = Math.min(matchingRecord.startedAt, update.startedAt);
      matchingRecord.endedAt = Math.max(matchingRecord.endedAt, update.endedAt);
      matchingRecord.effectiveReadingMs += update.effectiveReadingMs;
      matchingRecord.effectiveWords += update.effectiveWords;
      matchingRecord.confidence = weightedAverageConfidence(
        matchingRecord.confidence,
        existingEffectiveReadingMs,
        update.confidence,
        update.effectiveReadingMs,
      );
      matchingRecord.domain = page.domain;
      matchingRecord.resourceType = page.resourceType;
      changedRecords.set(matchingRecord.id, matchingRecord);
      continue;
    }

    const record: ReadingSessionRecord = {
      id: createReadingSessionId(update.sessionId, update.date, update.startedAt),
      sessionId: update.sessionId,
      date: update.date,
      pageId: page.pageId,
      domain: page.domain,
      resourceType: page.resourceType,
      startedAt: update.startedAt,
      endedAt: update.endedAt,
      effectiveReadingMs: update.effectiveReadingMs,
      effectiveWords: update.effectiveWords,
      confidence: update.confidence,
    };
    records.push(record);
    changedRecords.set(record.id, record);
  }

  if (changedRecords.size > 0) {
    await db.readingSessions.bulkPut(Array.from(changedRecords.values()));
  }
}

function getReadingSessionIntervalGap(
  record: Pick<ReadingSessionRecord, 'startedAt' | 'endedAt'>,
  update: Pick<ReturnType<typeof summarizeReadingEventBatch>['sessionUpdates'][number], 'startedAt' | 'endedAt'>,
): number {
  if (update.startedAt > record.endedAt) {
    return update.startedAt - record.endedAt;
  }
  if (record.startedAt > update.endedAt) {
    return record.startedAt - update.endedAt;
  }
  return 0;
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

    const tick = decodeViewportExposureTick(event.value);
    if (
      tick.tickMs <= 0 ||
      !tick.activeTab ||
      !tick.documentVisible ||
      tick.idleAgeMs > MAX_ADAPTIVE_IDLE_MS ||
      Math.abs(tick.scrollSpeedWordsPerMinute) > baseWordsPerMinute * 1.6 ||
      tick.scrollDirection < 0
    ) {
      ended = true;
      break;
    }
    if (tick.scrollDirection > 0) episode.lastScrollDirection = tick.scrollDirection;

    const reliableVisibleChunks = tick.visibleChunks.filter((visibleChunk) => (
      chunksById.has(visibleChunk.chunkId) &&
      visibleChunk.visibleRatio >= MIN_ADAPTIVE_VISIBLE_RATIO &&
      visibleChunk.contentMultiplier >= MIN_ADAPTIVE_CONTENT_MULTIPLIER &&
      Number.isFinite(visibleChunk.viewportY)
    ));
    if (reliableVisibleChunks.length === 0) {
      continue;
    }

    episode.activeMs += tick.tickMs;
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
        state.centerDwellMs += tick.tickMs;
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

function createReadingSessionId(sessionId: string, date: string, startedAt: number): string {
  return `${sessionId}:${date}:${Math.floor(startedAt)}`;
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

function resolveUpdatedPageCoverage(
  page: PageSnapshot,
  existingPage: PageRecord | undefined,
  measuredCurrentCoverage: number,
  migratedCoverageBaseline: number,
  pageNewWords: number,
): number {
  const measuredCoverage = Math.max(measuredCurrentCoverage, migratedCoverageBaseline);
  const continuingPdfResource = page.resourceType === 'pdf' && (
    existingPage === undefined
    || (
      existingPage.resourceType === 'pdf'
      && existingPage.resourceId === page.resourceId
    )
  );
  if (!continuingPdfResource) {
    return Math.min(page.totalWords, measuredCoverage);
  }

  const storedCoverage = existingPage
    ? existingPage.coveredWords
      ?? Math.min(existingPage.totalWords, existingPage.effectiveWords)
    : 0;
  const accumulatedCoverage = Math.max(storedCoverage, migratedCoverageBaseline) + pageNewWords;
  return Math.min(page.totalWords, Math.max(measuredCoverage, accumulatedCoverage));
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
