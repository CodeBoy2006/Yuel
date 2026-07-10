import type { ReadingConfidence } from './events';

export interface VisibleChunkBudgetInput {
  chunkId: string;
  wordCount: number;
  visibleRatio: number;
  centerDistance: number;
  contentWeight: number;
  /** Additive visible-text attention mass. Falls back to visible words × center weight for legacy events. */
  attentionMass?: number;
  /** Local reading-rate multiplier. Falls back to the legacy contentWeight field. */
  contentMultiplier?: number;
  /** Estimated words currently visible. Used for confidence, not as a renewable per-tick cap. */
  visibleWordCount?: number;
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
export const READING_METRIC_MODEL_VERSION = 2;

const MIN_EFFECTIVE_VISIBLE_RATIO = 0.5;
const MIN_CHUNK_WORDS = 5;
const VIEWPORT_FULL_TEXT_SUPPLY_WORDS = 80;
const ALLOCATION_EPSILON_MS = 1e-7;

export function allocateReadingBudget(input: ReadingBudgetInput): ReadingBudgetEstimate {
  const tickMs = Math.max(0, finiteOr(input.tickMs, 0));
  const baseWordsPerMinute = Math.max(1, finiteOr(input.baseWordsPerMinute, DEFAULT_BASE_WORDS_PER_MINUTE));
  const eligibleChunks = input.visibleChunks.filter(isEligibleChunk);
  const visibleWordSupply = eligibleChunks.reduce(
    (sum, chunk) => sum + getVisibleWordCount(chunk),
    0,
  );
  const textAvailabilityWeight = clamp(visibleWordSupply / VIEWPORT_FULL_TEXT_SUPPLY_WORDS, 0, 1);
  const activeWeight = input.isActiveTab && input.isDocumentVisible ? 1 : 0;
  const idle = idleWeight(input.idleAgeMs);
  const scroll = scrollWeight(input.scrollSpeedWordsPerMinute, baseWordsPerMinute);
  const engagementWeight = clamp(activeWeight * idle * scroll, 0, 1);
  const confidenceScore = clamp(engagementWeight * textAvailabilityWeight, 0, 1);
  const effectiveTimeBudgetMs = tickMs * engagementWeight;
  const tickBudgetWords = (baseWordsPerMinute * effectiveTimeBudgetMs) / 60_000;
  const attentionWeights = eligibleChunks.map((chunk) => ({
    chunk,
    weight: getAttentionMass(chunk),
  }));
  const totalAttentionWeight = attentionWeights.reduce((sum, item) => sum + item.weight, 0);

  if (effectiveTimeBudgetMs <= 0 || totalAttentionWeight <= 0) {
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

  const timeAllocations = allocateWeightedTime(
    attentionWeights.map(({ chunk, weight }) => ({
      chunkId: chunk.chunkId,
      attentionMass: weight,
      capacityMs: getChunkTimeCapacityMs(chunk, baseWordsPerMinute),
    })),
    effectiveTimeBudgetMs,
  );
  const chunkEstimates = attentionWeights.map(({ chunk, weight }) => {
    const attentionShare = weight / totalAttentionWeight;
    const effectiveReadingMs = timeAllocations.get(chunk.chunkId) ?? 0;
    const effectiveWords = effectiveReadingMs * getChunkWordsPerMs(chunk, baseWordsPerMinute);
    const lifetimeRemaining = Math.max(0, chunk.wordCount - Math.max(0, chunk.lifetimeEffectiveWords));
    const newWords = Math.min(effectiveWords, lifetimeRemaining);

    return {
      chunkId: chunk.chunkId,
      attentionShare,
      effectiveWords,
      newWords,
      reviewWords: effectiveWords - newWords,
      effectiveReadingMs,
      confidence: confidenceScore,
    };
  });
  const allocatedWords = chunkEstimates.reduce((sum, chunk) => sum + chunk.effectiveWords, 0);
  const effectiveReadingMs = chunkEstimates.reduce((sum, chunk) => sum + chunk.effectiveReadingMs, 0);

  return {
    tickBudgetWords,
    allocatedWords,
    rawExposureMs: tickMs,
    effectiveReadingMs,
    confidence: confidenceFromScore(confidenceScore),
    confidenceScore,
    chunkEstimates,
  };
}

function isEligibleChunk(chunk: VisibleChunkBudgetInput): boolean {
  return (
    chunk.visibleRatio >= MIN_EFFECTIVE_VISIBLE_RATIO &&
    chunk.wordCount >= MIN_CHUNK_WORDS &&
    getContentMultiplier(chunk) > 0 &&
    getAttentionMass(chunk) > 0 &&
    chunk.todayEffectiveWords < chunk.wordCount &&
    chunk.sessionEffectiveWords < chunk.wordCount
  );
}

function getAttentionMass(chunk: VisibleChunkBudgetInput): number {
  const explicitAttentionMass = finiteOr(chunk.attentionMass ?? Number.NaN, Number.NaN);
  if (Number.isFinite(explicitAttentionMass)) {
    return Math.max(0, explicitAttentionMass);
  }

  const centerWeight = clamp(1 - finiteOr(chunk.centerDistance, 0) * 0.35, 0.7, 1.15);
  return getVisibleWordCount(chunk) * centerWeight;
}

function getVisibleWordCount(chunk: VisibleChunkBudgetInput): number {
  const wordCount = Math.max(0, finiteOr(chunk.wordCount, 0));
  const explicitVisibleWords = finiteOr(chunk.visibleWordCount ?? Number.NaN, Number.NaN);
  if (Number.isFinite(explicitVisibleWords)) {
    return clamp(explicitVisibleWords, 0, wordCount);
  }

  return wordCount * clamp(chunk.visibleRatio, 0, 1);
}

function getContentMultiplier(chunk: VisibleChunkBudgetInput): number {
  return clamp(chunk.contentMultiplier ?? chunk.contentWeight, 0, 1);
}

function getChunkWordsPerMs(chunk: VisibleChunkBudgetInput, baseWordsPerMinute: number): number {
  return (baseWordsPerMinute * getContentMultiplier(chunk)) / 60_000;
}

function getChunkTimeCapacityMs(chunk: VisibleChunkBudgetInput, baseWordsPerMinute: number): number {
  const sessionRemaining = Math.max(0, chunk.wordCount - Math.max(0, chunk.sessionEffectiveWords));
  const dayRemaining = Math.max(0, chunk.wordCount - Math.max(0, chunk.todayEffectiveWords));
  const remainingWords = Math.min(sessionRemaining, dayRemaining);
  const wordsPerMs = getChunkWordsPerMs(chunk, baseWordsPerMinute);
  return wordsPerMs > 0 ? remainingWords / wordsPerMs : 0;
}

interface WeightedTimeCandidate {
  chunkId: string;
  attentionMass: number;
  capacityMs: number;
}

/**
 * Allocate one shared attention-time budget with capped weighted water-filling.
 * Saturated segments leave the pool together, so input order cannot change the
 * result and unused time is redistributed to segments that still have capacity.
 */
function allocateWeightedTime(candidates: WeightedTimeCandidate[], budgetMs: number): Map<string, number> {
  const allocations = new Map(candidates.map((candidate) => [candidate.chunkId, 0]));
  let remainingBudgetMs = Math.max(0, finiteOr(budgetMs, 0));
  let active = candidates.filter(
    (candidate) => candidate.attentionMass > 0 && candidate.capacityMs > ALLOCATION_EPSILON_MS,
  );

  while (remainingBudgetMs > ALLOCATION_EPSILON_MS && active.length > 0) {
    const totalAttentionMass = active.reduce((sum, candidate) => sum + candidate.attentionMass, 0);
    if (totalAttentionMass <= 0) break;

    const saturated = active.filter((candidate) => {
      const proposedMs = remainingBudgetMs * candidate.attentionMass / totalAttentionMass;
      return proposedMs >= candidate.capacityMs - ALLOCATION_EPSILON_MS;
    });

    if (saturated.length === 0) {
      for (const candidate of active) {
        allocations.set(
          candidate.chunkId,
          (allocations.get(candidate.chunkId) ?? 0)
            + remainingBudgetMs * candidate.attentionMass / totalAttentionMass,
        );
      }
      remainingBudgetMs = 0;
      break;
    }

    const saturatedIds = new Set(saturated.map((candidate) => candidate.chunkId));
    for (const candidate of saturated) {
      allocations.set(candidate.chunkId, (allocations.get(candidate.chunkId) ?? 0) + candidate.capacityMs);
      remainingBudgetMs = Math.max(0, remainingBudgetMs - candidate.capacityMs);
    }
    active = active.filter((candidate) => !saturatedIds.has(candidate.chunkId));
  }

  return allocations;
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
