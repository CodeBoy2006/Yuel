import { allocateReadingBudget, DEFAULT_BASE_WORDS_PER_MINUTE, type VisibleChunkBudgetInput } from '../domain/metrics';
import { formatLocalDate } from '../domain/localDate';
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
}

interface VisibleChunkEventValue {
  chunkId: string;
  wordCount: number;
  visibleRatio: number;
  centerDistance: number;
  contentWeight: number;
  attentionMass?: number;
  contentMultiplier?: number;
  visibleWordCount?: number;
}

export function summarizeReadingEventBatch(
  payload: ReadingEventBatchPayload,
  state: ReadingAggregationState = {},
): ReadingBatchSummary {
  const chunksById = new Map(payload.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const chunkUpdates = new Map<string, ChunkReadingUpdate>();
  const chunkStates = cloneChunkStates(state.chunkStates);
  const chunkDayStates = cloneChunkDayStates(state.chunkDayStates);
  const chunkDayUpdates = new Map<string, ChunkDayReadingUpdate>();
  const dailyUpdates = new Map<string, DailyReadingUpdate>();
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

    const value = readObject(event.value);
    const tickMs = readPositiveNumber(value, 'tickMs');
    const visibleChunkValues = readVisibleChunks(value?.visibleChunks);
    const date = formatLocalDate(event.occurredAt);
    if (tickMs <= 0 || visibleChunkValues.length === 0) {
      continue;
    }

    const visibleChunks = visibleChunkValues.flatMap((visibleChunk): VisibleChunkBudgetInput[] => {
      const chunk = chunksById.get(visibleChunk.chunkId);
      if (!chunk) {
        return [];
      }

      const chunkState = state.chunkStates?.get(chunk.chunkId);
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
          sessionEffectiveWords: runningChunkState?.sessionEffectiveWords ?? chunkState?.sessionEffectiveWords ?? 0,
          todayEffectiveWords:
            runningChunkDayState?.effectiveWords ??
            runningChunkState?.todayEffectiveWords ??
            chunkState?.todayEffectiveWords ??
            0,
          lifetimeEffectiveWords: runningChunkState?.lifetimeEffectiveWords ?? chunkState?.lifetimeEffectiveWords ?? 0,
        },
      ];
    });
    if (visibleChunks.length === 0) {
      continue;
    }

    const estimate = allocateReadingBudget({
      tickMs,
      baseWordsPerMinute:
        readPositiveFiniteNumber(state.baseWordsPerMinute) ??
        (readPositiveNumber(value, 'baseWordsPerMinute') || DEFAULT_BASE_WORDS_PER_MINUTE),
      isActiveTab: readBoolean(value, 'activeTab', true),
      isDocumentVisible: readBoolean(value, 'documentVisible', true),
      scrollSpeedWordsPerMinute: readNumber(value, 'scrollSpeedWordsPerMinute', 0),
      idleAgeMs: readNumber(value, 'idleAgeMs', 0),
      visibleChunks,
    });

    totalRawExposureMs += estimate.rawExposureMs;
    totalEffectiveReadingMs += estimate.effectiveReadingMs;
    pageEffectiveWords += estimate.allocatedWords;

    recordVisibleChunkRawExposure(chunkUpdates, chunkDayUpdates, date, visibleChunks, estimate.rawExposureMs, estimate.confidenceScore);

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
      newWords: (existingDailyUpdate?.newWords ?? 0) + sumChunkField(estimate.chunkEstimates, 'newWords'),
      reviewWords: (existingDailyUpdate?.reviewWords ?? 0) + sumChunkField(estimate.chunkEstimates, 'reviewWords'),
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

function cloneChunkStates(states: Map<string, ChunkReadingState> | undefined): Map<string, ChunkReadingState> {
  return new Map(Array.from(states ?? [], ([chunkId, state]) => [chunkId, { ...state }]));
}

function cloneChunkDayStates(
  states: Map<string, Map<string, ChunkDayReadingState>> | undefined,
): Map<string, Map<string, ChunkDayReadingState>> {
  return new Map(
    Array.from(states ?? [], ([date, chunkStates]) => [
      date,
      new Map(Array.from(chunkStates, ([chunkId, state]) => [chunkId, { ...state }])),
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

function readVisibleChunks(value: unknown): VisibleChunkEventValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate): VisibleChunkEventValue[] => {
    const visibleChunk = readObject(candidate);
    if (!visibleChunk) {
      return [];
    }

    const chunkId = visibleChunk.chunkId;
    if (typeof chunkId !== 'string' || chunkId.trim().length === 0) {
      return [];
    }

    return [
      {
        chunkId,
        wordCount: readPositiveNumber(visibleChunk, 'wordCount'),
        visibleRatio: readNumber(visibleChunk, 'visibleRatio', 0),
        centerDistance: readNumber(visibleChunk, 'centerDistance', 0),
        contentWeight: readNumber(visibleChunk, 'contentWeight', 0),
        attentionMass: readOptionalNumber(visibleChunk, 'attentionMass'),
        contentMultiplier: readOptionalNumber(visibleChunk, 'contentMultiplier'),
        visibleWordCount: readOptionalNumber(visibleChunk, 'visibleWordCount'),
      },
    ];
  });
}

function sumChunkField(chunks: Array<{ newWords: number; reviewWords: number }>, key: 'newWords' | 'reviewWords'): number {
  return chunks.reduce((sum, chunk) => sum + chunk[key], 0);
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

function readPositiveFiniteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function readOptionalNumber(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}

function readBoolean(value: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const candidate = value?.[key];
  return typeof candidate === 'boolean' ? candidate : fallback;
}
