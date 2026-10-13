import { allocateReadingBudget, DEFAULT_BASE_WORDS_PER_MINUTE, weightedAverageConfidence, type VisibleChunkBudgetInput } from '../domain/metrics';
import { formatLocalDate } from '../domain/localDate';
import { decodeViewportExposureTick } from '../domain/viewportExposure';
import type { ReadingEventBatchPayload } from '../messaging/contracts';

export interface ChunkReadingState {
  sessionEffectiveWords: number;
  todayEffectiveWords: number;
  lifetimeEffectiveWords: number;
}

export interface ReadingAggregationState {
  chunkStates?: Map<string, ChunkReadingState>;
  chunkDayStates?: Map<string, Map<string, ChunkDayReadingState>>;
  baseWordsPerMinute?: number;
}

export interface ChunkDayReadingState {
  effectiveWords: number;
}

export interface ChunkReadingUpdate {
  chunkId: string;
  rawExposureMs: number;
  effectiveReadingMs: number;
  effectiveWords: number;
  newWords: number;
  reviewWords: number;
  confidence: number;
  lastEffectiveReadAt?: number;
}

export interface DailyReadingUpdate {
  date: string;
  effectiveWords: number;
  newWords: number;
  reviewWords: number;
  minutes: number;
  rawExposureMs: number;
  effectiveReadingMs: number;
}

export interface ChunkDayReadingUpdate {
  date: string;
  chunkId: string;
  rawExposureMs: number;
  effectiveReadingMs: number;
  effectiveWords: number;
  newWords: number;
  reviewWords: number;
}

export interface ReadingSessionUpdate {
  sessionId: string;
  date: string;
  startedAt: number;
  endedAt: number;
  effectiveReadingMs: number;
  effectiveWords: number;
  confidence: number;
}

export interface ReadingBatchSummary {
  chunkUpdates: ChunkReadingUpdate[];
  pageEffectiveWords: number;
  pageNewWords: number;
  pageReviewWords: number;
  totalRawExposureMs: number;
  totalEffectiveReadingMs: number;
  lastEffectiveReadAt?: number;
  dailyUpdates: DailyReadingUpdate[];
  chunkDayUpdates: ChunkDayReadingUpdate[];
  sessionUpdates: ReadingSessionUpdate[];
}

export function summarizeReadingEventBatch(
  payload: ReadingEventBatchPayload,
  state: ReadingAggregationState = {},
): ReadingBatchSummary {
  const chunksById = new Map(payload.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const chunkUpdates = new Map<string, ChunkReadingUpdate>();
  // Updates replace entries, so only the maps need independent copies.
  const chunkStates = new Map(state.chunkStates);
  const chunkDayStates = cloneChunkDayStates(state.chunkDayStates);
  const chunkDayUpdates = new Map<string, ChunkDayReadingUpdate>();
  const dailyUpdates = new Map<string, DailyReadingUpdate>();
  const sessionUpdates: ReadingSessionUpdate[] = [];
  let pageEffectiveWords = 0;
  let pageNewWords = 0;
  let pageReviewWords = 0;
  let totalRawExposureMs = 0;
  let totalEffectiveReadingMs = 0;
  let lastEffectiveReadAt: number | undefined;

  for (const event of payload.events) {
    if (event.kind !== 'TextViewportExposureTick') {
      continue;
    }

    const tick = decodeViewportExposureTick(event.value);
    const date = formatLocalDate(event.occurredAt);
    if (tick.tickMs <= 0 || tick.visibleChunks.length === 0) {
      continue;
    }

    const visibleChunks = tick.visibleChunks.flatMap((visibleChunk): VisibleChunkBudgetInput[] => {
      const chunk = chunksById.get(visibleChunk.chunkId);
      if (!chunk) {
        return [];
      }

      const runningChunkState = chunkStates.get(chunk.chunkId);
      const runningChunkDayState = chunkDayStates.get(date)?.get(chunk.chunkId);
      return [
        {
          chunkId: chunk.chunkId,
          wordCount: Math.min(chunk.wordCount, Math.round(visibleChunk.wordCount)),
          visibleRatio: visibleChunk.visibleRatio,
          centerDistance: visibleChunk.centerDistance,
          contentWeight: visibleChunk.contentWeight,
          attentionMass: visibleChunk.attentionMass,
          contentMultiplier: visibleChunk.contentMultiplier,
          visibleWordCount: visibleChunk.visibleWordCount,
          sessionEffectiveWords: runningChunkState?.sessionEffectiveWords ?? 0,
          todayEffectiveWords: runningChunkDayState?.effectiveWords ?? runningChunkState?.todayEffectiveWords ?? 0,
          lifetimeEffectiveWords: runningChunkState?.lifetimeEffectiveWords ?? 0,
        },
      ];
    });
    if (visibleChunks.length === 0) {
      continue;
    }

    const estimate = allocateReadingBudget({
      tickMs: tick.tickMs,
      baseWordsPerMinute:
        readPositiveFiniteNumber(state.baseWordsPerMinute) ??
        (tick.baseWordsPerMinute || DEFAULT_BASE_WORDS_PER_MINUTE),
      isActiveTab: tick.activeTab,
      isDocumentVisible: tick.documentVisible,
      scrollSpeedWordsPerMinute: tick.scrollSpeedWordsPerMinute,
      idleAgeMs: tick.idleAgeMs,
      visibleChunks,
    });

    totalRawExposureMs += estimate.rawExposureMs;
    totalEffectiveReadingMs += estimate.effectiveReadingMs;
    pageEffectiveWords += estimate.allocatedWords;

    if (estimate.effectiveReadingMs > 0) {
      sessionUpdates.push({
        sessionId: event.sessionId,
        date,
        startedAt: Math.max(0, event.occurredAt - tick.tickMs),
        endedAt: event.occurredAt,
        effectiveReadingMs: estimate.effectiveReadingMs,
        effectiveWords: estimate.allocatedWords,
        confidence: estimate.confidenceScore,
      });
    }

    recordVisibleChunkRawExposure(chunkUpdates, chunkDayUpdates, date, visibleChunks, estimate.rawExposureMs, estimate.confidenceScore);

    let tickNewWords = 0;
    let tickReviewWords = 0;
    for (const chunkEstimate of estimate.chunkEstimates) {
      const existingUpdate = chunkUpdates.get(chunkEstimate.chunkId);
      const nextEffectiveWords = (existingUpdate?.effectiveWords ?? 0) + chunkEstimate.effectiveWords;
      const nextEffectiveReadingMs = (existingUpdate?.effectiveReadingMs ?? 0) + chunkEstimate.effectiveReadingMs;
      const nextNewWords = (existingUpdate?.newWords ?? 0) + chunkEstimate.newWords;
      const nextReviewWords = (existingUpdate?.reviewWords ?? 0) + chunkEstimate.reviewWords;

      chunkUpdates.set(chunkEstimate.chunkId, {
        chunkId: chunkEstimate.chunkId,
        rawExposureMs: existingUpdate?.rawExposureMs ?? 0,
        effectiveReadingMs: nextEffectiveReadingMs,
        effectiveWords: nextEffectiveWords,
        newWords: nextNewWords,
        reviewWords: nextReviewWords,
        confidence: weightedAverageConfidence(
          existingUpdate?.confidence ?? 0,
          existingUpdate?.effectiveWords ?? 0,
          chunkEstimate.confidence,
          chunkEstimate.effectiveWords,
        ),
        lastEffectiveReadAt: chunkEstimate.effectiveWords > 0
          ? event.occurredAt
          : existingUpdate?.lastEffectiveReadAt,
      });
      pageNewWords += chunkEstimate.newWords;
      pageReviewWords += chunkEstimate.reviewWords;
      tickNewWords += chunkEstimate.newWords;
      tickReviewWords += chunkEstimate.reviewWords;
      incrementRunningChunkState(chunkStates, chunkEstimate.chunkId, chunkEstimate.effectiveWords, chunkEstimate.newWords);
      incrementRunningChunkDayState(chunkDayStates, date, chunkEstimate.chunkId, chunkEstimate.effectiveWords);
      const chunkDayUpdateKey = `${date}:${chunkEstimate.chunkId}`;
      const existingChunkDayUpdate = chunkDayUpdates.get(chunkDayUpdateKey);
      chunkDayUpdates.set(chunkDayUpdateKey, {
        date,
        chunkId: chunkEstimate.chunkId,
        rawExposureMs: existingChunkDayUpdate?.rawExposureMs ?? 0,
        effectiveReadingMs: (existingChunkDayUpdate?.effectiveReadingMs ?? 0) + chunkEstimate.effectiveReadingMs,
        effectiveWords: (existingChunkDayUpdate?.effectiveWords ?? 0) + chunkEstimate.effectiveWords,
        newWords: (existingChunkDayUpdate?.newWords ?? 0) + chunkEstimate.newWords,
        reviewWords: (existingChunkDayUpdate?.reviewWords ?? 0) + chunkEstimate.reviewWords,
      });
    }

    if (estimate.allocatedWords <= 0) {
      continue;
    }
    lastEffectiveReadAt = Math.max(lastEffectiveReadAt ?? 0, event.occurredAt);

    const existingDailyUpdate = dailyUpdates.get(date);
    dailyUpdates.set(date, {
      date,
      effectiveWords: (existingDailyUpdate?.effectiveWords ?? 0) + estimate.allocatedWords,
      newWords: (existingDailyUpdate?.newWords ?? 0) + tickNewWords,
      reviewWords: (existingDailyUpdate?.reviewWords ?? 0) + tickReviewWords,
      minutes: (existingDailyUpdate?.minutes ?? 0) + estimate.effectiveReadingMs / 60_000,
      rawExposureMs: (existingDailyUpdate?.rawExposureMs ?? 0) + estimate.rawExposureMs,
      effectiveReadingMs: (existingDailyUpdate?.effectiveReadingMs ?? 0) + estimate.effectiveReadingMs,
    });
  }

  return {
    chunkUpdates: Array.from(chunkUpdates.values()).filter((update) => update.rawExposureMs > 0),
    pageEffectiveWords,
    pageNewWords,
    pageReviewWords,
    totalRawExposureMs,
    totalEffectiveReadingMs,
    lastEffectiveReadAt,
    dailyUpdates: Array.from(dailyUpdates.values()),
    chunkDayUpdates: Array.from(chunkDayUpdates.values()),
    sessionUpdates,
  };
}

function recordVisibleChunkRawExposure(
  chunkUpdates: Map<string, ChunkReadingUpdate>,
  chunkDayUpdates: Map<string, ChunkDayReadingUpdate>,
  date: string,
  visibleChunks: VisibleChunkBudgetInput[],
  rawExposureMs: number,
  confidence: number,
): void {
  for (const chunk of visibleChunks) {
    const existingUpdate = chunkUpdates.get(chunk.chunkId);
    chunkUpdates.set(chunk.chunkId, {
      chunkId: chunk.chunkId,
      rawExposureMs: (existingUpdate?.rawExposureMs ?? 0) + rawExposureMs,
      effectiveReadingMs: existingUpdate?.effectiveReadingMs ?? 0,
      effectiveWords: existingUpdate?.effectiveWords ?? 0,
      newWords: existingUpdate?.newWords ?? 0,
      reviewWords: existingUpdate?.reviewWords ?? 0,
      confidence: existingUpdate?.confidence ?? confidence,
      lastEffectiveReadAt: existingUpdate?.lastEffectiveReadAt,
    });

    const chunkDayUpdateKey = `${date}:${chunk.chunkId}`;
    const existingChunkDayUpdate = chunkDayUpdates.get(chunkDayUpdateKey);
    chunkDayUpdates.set(chunkDayUpdateKey, {
      date,
      chunkId: chunk.chunkId,
      rawExposureMs: (existingChunkDayUpdate?.rawExposureMs ?? 0) + rawExposureMs,
      effectiveReadingMs: existingChunkDayUpdate?.effectiveReadingMs ?? 0,
      effectiveWords: existingChunkDayUpdate?.effectiveWords ?? 0,
      newWords: existingChunkDayUpdate?.newWords ?? 0,
      reviewWords: existingChunkDayUpdate?.reviewWords ?? 0,
    });
  }
}

function cloneChunkDayStates(
  states: Map<string, Map<string, ChunkDayReadingState>> | undefined,
): Map<string, Map<string, ChunkDayReadingState>> {
  return new Map(
    Array.from(states ?? [], ([date, chunkStates]) => [
      date,
      new Map(chunkStates),
    ]),
  );
}

function incrementRunningChunkState(
  states: Map<string, ChunkReadingState>,
  chunkId: string,
  effectiveWords: number,
  newWords: number,
): void {
  const existing = states.get(chunkId);
  states.set(chunkId, {
    sessionEffectiveWords: (existing?.sessionEffectiveWords ?? 0) + effectiveWords,
    todayEffectiveWords: (existing?.todayEffectiveWords ?? 0) + effectiveWords,
    lifetimeEffectiveWords: (existing?.lifetimeEffectiveWords ?? 0) + newWords,
  });
}

function incrementRunningChunkDayState(
  states: Map<string, Map<string, ChunkDayReadingState>>,
  date: string,
  chunkId: string,
  effectiveWords: number,
): void {
  const dayStates = states.get(date) ?? new Map<string, ChunkDayReadingState>();
  const existing = dayStates.get(chunkId);
  dayStates.set(chunkId, {
    effectiveWords: (existing?.effectiveWords ?? 0) + effectiveWords,
  });
  states.set(date, dayStates);
}

function readPositiveFiniteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}
