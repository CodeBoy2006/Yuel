import type { ReadingConfidence } from './events';

export interface EffectiveReadingInput {
  rawWords: number;
  visibleRatio: number;
  dwellMs: number;
  activeTab: boolean;
  scrollSpeedWordsPerMinute: number;
  idle: boolean;
  interactionCount: number;
  repeatViews: number;
}

export interface EffectiveReadingEstimate {
  effectiveWords: number;
  confidence: ReadingConfidence;
  score: number;
}

const EXPECTED_READING_WPM = 220;

export function estimateEffectiveWords(input: EffectiveReadingInput): EffectiveReadingEstimate {
  const rawWords = Math.max(0, input.rawWords);

  if (rawWords === 0) {
    return { effectiveWords: 0, confidence: 'low', score: 0 };
  }

  const expectedDwellMs = (rawWords / EXPECTED_READING_WPM) * 60_000;
  const visibleWeight = clamp(input.visibleRatio, 0, 1);
  const dwellWeight = clamp(input.dwellMs / Math.max(expectedDwellMs, 1), 0, 1);
  const activeTabWeight = input.activeTab ? 1 : 0.25;
  const scrollWeight = scrollSpeedWeight(input.scrollSpeedWordsPerMinute);
  const idleWeight = input.idle ? 0.15 : 1;
  const interactionBonus = 1 + Math.min(Math.max(input.interactionCount, 0), 3) * 0.03;
  const repeatViewCap = 1 / (1 + Math.max(input.repeatViews - 1, 0) * 0.18);

  const score = clamp(
    visibleWeight * dwellWeight * activeTabWeight * scrollWeight * idleWeight * interactionBonus * repeatViewCap,
    0,
    1,
  );

  return {
    effectiveWords: Math.min(rawWords, Math.round(rawWords * score)),
    confidence: confidenceFromScore(score),
    score,
  };
}

function scrollSpeedWeight(wordsPerMinute: number): number {
  if (wordsPerMinute <= 0) return 1;
  if (wordsPerMinute <= 400) return 1;
  if (wordsPerMinute >= 1_200) return 0.18;

  const penalty = (wordsPerMinute - 400) / 800;
  return 1 - penalty * 0.82;
}

function confidenceFromScore(score: number): ReadingConfidence {
  if (score >= 0.55) return 'high';
  if (score >= 0.22) return 'medium';
  return 'low';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
