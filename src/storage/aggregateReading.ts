import type { TextChunkSnapshot } from '../domain/events';
import { estimateEffectiveWords } from '../domain/metrics';
import type { ReadingEventBatchPayload } from '../messaging/contracts';

export interface ChunkReadingUpdate {
  chunkId: string;
  exposureSeconds: number;
  effectiveWords: number;
}

export interface DailyReadingUpdate {
  date: string;
  effectiveWords: number;
  minutes: number;
}

export interface ReadingBatchSummary {
  chunkUpdates: ChunkReadingUpdate[];
  pageEffectiveWords: number;
  totalExposureSeconds: number;
  dailyUpdates: DailyReadingUpdate[];
}

export function summarizeReadingEventBatch(payload: ReadingEventBatchPayload): ReadingBatchSummary {
  const chunksById = new Map(payload.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const chunkUpdates = new Map<string, ChunkReadingUpdate>();
  const dailyUpdates = new Map<string, DailyReadingUpdate>();
  let pageEffectiveWords = 0;
  let totalExposureSeconds = 0;

  for (const event of payload.events) {
    if (event.kind !== 'TextBlockExposureTick' || !event.chunkId) {
      continue;
    }

    const chunk = chunksById.get(event.chunkId);
    const dwellMs = readPositiveNumber(event.value, 'dwellMs');
    if (!chunk || dwellMs <= 0) {
      continue;
    }

    const exposureSeconds = dwellMs / 1_000;
    const effectiveWords = estimateExposureEffectiveWords(chunk, event.value, dwellMs);
    const existingChunkUpdate = chunkUpdates.get(chunk.chunkId);
    const nextChunkUpdate: ChunkReadingUpdate = {
      chunkId: chunk.chunkId,
      exposureSeconds: (existingChunkUpdate?.exposureSeconds ?? 0) + exposureSeconds,
      effectiveWords: (existingChunkUpdate?.effectiveWords ?? 0) + effectiveWords,
    };

    chunkUpdates.set(chunk.chunkId, nextChunkUpdate);
    pageEffectiveWords += effectiveWords;
    totalExposureSeconds += exposureSeconds;

    const date = formatLocalDate(event.occurredAt);
    const existingDailyUpdate = dailyUpdates.get(date);
    dailyUpdates.set(date, {
      date,
      effectiveWords: (existingDailyUpdate?.effectiveWords ?? 0) + effectiveWords,
      minutes: (existingDailyUpdate?.minutes ?? 0) + exposureSeconds / 60,
    });
  }

  return {
    chunkUpdates: Array.from(chunkUpdates.values()),
    pageEffectiveWords,
    totalExposureSeconds,
    dailyUpdates: Array.from(dailyUpdates.values()),
  };
}

function estimateExposureEffectiveWords(
  chunk: TextChunkSnapshot,
  value: Record<string, unknown> | undefined,
  dwellMs: number,
): number {
  const wordCount = readPositiveNumber(value, 'wordCount') || chunk.wordCount;
  const visibleRatio = readNumber(value, 'visibleRatio', 0);
  const scrollSpeedWordsPerMinute = readNumber(value, 'scrollSpeedWordsPerMinute', 0);
  const interactionCount = readNumber(value, 'interactionCount', 0);
  const repeatViews = readPositiveNumber(value, 'repeatViews') || 1;

  return estimateEffectiveWords({
    rawWords: Math.min(chunk.wordCount, Math.round(wordCount)),
    visibleRatio,
    dwellMs,
    activeTab: readBoolean(value, 'activeTab', true),
    scrollSpeedWordsPerMinute,
    idle: readBoolean(value, 'idle', false),
    interactionCount,
    repeatViews,
  }).effectiveWords;
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

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
