import type { ReadingConfidence } from './events';

export interface VisibleChunkBudgetInput {
  chunkId: string;
  wordCount: number;
  visibleRatio: number;
  centerDistance: number;
  contentWeight: number;
  sessionEffectiveWords: number;
  todayEffectiveWords: number;
  lifetimeEffectiveWords: number;
}

export interface ReadingBudgetInput {
  tickMs: number;
  baseWordsPerMinute: number;
  isActiveTab: boolean;
  isDocumentVisible: boolean;
  scrollSpeedWordsPerMinute: number;
  idleAgeMs: number;
  visibleChunks: VisibleChunkBudgetInput[];
}

export interface ChunkBudgetEstimate {
  chunkId: string;
  attentionShare: number;
  effectiveWords: number;
  newWords: number;
  reviewWords: number;
  effectiveReadingMs: number;
  confidence: number;
}

export interface ReadingBudgetEstimate {
  tickBudgetWords: number;
  allocatedWords: number;
  rawExposureMs: number;
  effectiveReadingMs: number;
  confidence: ReadingConfidence;
  confidenceScore: number;
  chunkEstimates: ChunkBudgetEstimate[];
}

export const DEFAULT_BASE_WORDS_PER_MINUTE = 220;

const MIN_VISIBLE_RATIO = 0.15;
const MIN_CHUNK_WORDS = 5;
const VIEWPORT_FULL_TEXT_SUPPLY_WORDS = 80;
const MAX_CHUNK_VISIBLE_SUPPLY_WORDS = 120;

export function allocateReadingBudget(input: ReadingBudgetInput): ReadingBudgetEstimate {
  const tickMs = Math.max(0, finiteOr(input.tickMs, 0));
  const baseWordsPerMinute = Math.max(1, finiteOr(input.baseWordsPerMinute, DEFAULT_BASE_WORDS_PER_MINUTE));
  const eligibleChunks = input.visibleChunks.filter(isEligibleChunk);
  const visibleWordSupply = eligibleChunks.reduce(
    (sum, chunk) => sum + getVisibleWordSupply(chunk) * clamp(chunk.contentWeight, 0, 1),
    0,
  );
  const textAvailabilityWeight = clamp(visibleWordSupply / VIEWPORT_FULL_TEXT_SUPPLY_WORDS, 0, 1);
  const activeWeight = input.isActiveTab && input.isDocumentVisible ? 1 : 0;
  const idle = idleWeight(input.idleAgeMs);
  const scroll = scrollWeight(input.scrollSpeedWordsPerMinute, baseWordsPerMinute);
  const engagementWeight = clamp(activeWeight * idle * scroll, 0, 1);
  const confidenceScore = clamp(engagementWeight * textAvailabilityWeight, 0, 1);
  const rawBudgetWords = (baseWordsPerMinute * tickMs * engagementWeight) / 60_000;
  const tickBudgetWords = Math.min(rawBudgetWords, visibleWordSupply);
  const attentionWeights = eligibleChunks.map((chunk) => ({
    chunk,
    weight: getAttentionWeight(chunk),
  }));
  const totalAttentionWeight = attentionWeights.reduce((sum, item) => sum + item.weight, 0);

  if (tickBudgetWords <= 0 || totalAttentionWeight <= 0) {
    return {
      tickBudgetWords: 0,
      allocatedWords: 0,
      rawExposureMs: tickMs,
      effectiveReadingMs: 0,
      confidence: confidenceFromScore(confidenceScore),
      confidenceScore,
      chunkEstimates: input.visibleChunks.map((chunk) => createZeroChunkEstimate(chunk.chunkId, confidenceScore)),
    };
  }

  const chunkEstimates = attentionWeights.map(({ chunk, weight }) => {
    const attentionShare = weight / totalAttentionWeight;
    const proposedWords = tickBudgetWords * attentionShare;
    const visibleRemaining = getVisibleWordSupply(chunk);
    const sessionRemaining = Math.max(0, chunk.wordCount - Math.max(0, chunk.sessionEffectiveWords));
    const dayRemaining = Math.max(0, chunk.wordCount - Math.max(0, chunk.todayEffectiveWords));
    const effectiveWords = Math.max(0, Math.min(proposedWords, visibleRemaining, sessionRemaining, dayRemaining));
    const lifetimeRemaining = Math.max(0, chunk.wordCount - Math.max(0, chunk.lifetimeEffectiveWords));
    const newWords = Math.min(effectiveWords, lifetimeRemaining);

    return {
      chunkId: chunk.chunkId,
      attentionShare,
      effectiveWords,
      newWords,
      reviewWords: effectiveWords - newWords,
      effectiveReadingMs: 0,
      confidence: confidenceScore,
    };
  });
  const allocatedWords = chunkEstimates.reduce((sum, chunk) => sum + chunk.effectiveWords, 0);
  const effectiveReadingMs = (allocatedWords * 60_000) / baseWordsPerMinute;

  return {
    tickBudgetWords,
    allocatedWords,
    rawExposureMs: tickMs,
    effectiveReadingMs,
    confidence: confidenceFromScore(confidenceScore),
    confidenceScore,
    chunkEstimates: chunkEstimates.map((chunk) => ({
      ...chunk,
      effectiveReadingMs: allocatedWords > 0 ? effectiveReadingMs * (chunk.effectiveWords / allocatedWords) : 0,
    })),
  };
}

function isEligibleChunk(chunk: VisibleChunkBudgetInput): boolean {
  return (
    chunk.visibleRatio >= MIN_VISIBLE_RATIO &&
    chunk.wordCount >= MIN_CHUNK_WORDS &&
    chunk.contentWeight > 0 &&
    chunk.todayEffectiveWords < chunk.wordCount &&
    chunk.sessionEffectiveWords < chunk.wordCount
  );
}

function getAttentionWeight(chunk: VisibleChunkBudgetInput): number {
  const visibilityPart = Math.sqrt(Math.max(getVisibleWordSupply(chunk), 1));
  const centerWeight = clamp(1 - finiteOr(chunk.centerDistance, 0) * 0.35, 0.7, 1.15);

  return visibilityPart * centerWeight * clamp(chunk.contentWeight, 0, 1);
}

function getVisibleWordSupply(chunk: VisibleChunkBudgetInput): number {
  return Math.min(Math.max(0, chunk.wordCount) * clamp(chunk.visibleRatio, 0, 1), MAX_CHUNK_VISIBLE_SUPPLY_WORDS);
}

function idleWeight(idleAgeMs: number): number {
  const idleAge = Math.max(0, finiteOr(idleAgeMs, 0));

  if (idleAge <= 45_000) return 1;
  if (idleAge <= 120_000) return lerp(1, 0.35, (idleAge - 45_000) / 75_000);
  if (idleAge <= 300_000) return lerp(0.35, 0.05, (idleAge - 120_000) / 180_000);
  return 0;
}

function scrollWeight(wordsPerMinute: number, baseWordsPerMinute: number): number {
  const scrollWpm = Math.max(0, finiteOr(wordsPerMinute, 0));
  const normal = baseWordsPerMinute * 1.6;
  const fast = baseWordsPerMinute * 5;

  if (scrollWpm <= normal) return 1;
  if (scrollWpm >= fast) return 0.08;

  return lerp(1, 0.08, (scrollWpm - normal) / (fast - normal));
}

function confidenceFromScore(score: number): ReadingConfidence {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function createZeroChunkEstimate(chunkId: string, confidence: number): ChunkBudgetEstimate {
  return {
    chunkId,
    attentionShare: 0,
    effectiveWords: 0,
    newWords: 0,
    reviewWords: 0,
    effectiveReadingMs: 0,
    confidence,
  };
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp(amount, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
