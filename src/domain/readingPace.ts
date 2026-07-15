import { DEFAULT_BASE_WORDS_PER_MINUTE } from './metrics';

export type ReadingContentType = 'general' | 'tech' | 'academic';
export type ReadingPaceProfileSource = 'onboarding' | 'adaptive';

export interface ReadingPaceProfile {
  id: string;
  language: string;
  contentType: ReadingContentType;
  baseWordsPerMinute: number;
  adaptiveSampleCount: number;
  source: ReadingPaceProfileSource;
  updatedAt: number;
}

export interface OnboardingReadingPaceInput {
  language?: string;
  contentType?: ReadingContentType;
  wordCount: number;
  readingDurationMs: number;
  completedAt: number;
  correctAnswers: number;
  questionCount: number;
  defaultWordsPerMinute?: number;
}

export interface AdaptiveReadingPaceSample {
  observedWordsPerMinute: number;
  confidence: number;
}

export interface AdaptiveReadingPaceProfileOptions {
  language?: string;
  contentType?: ReadingContentType;
  now: number;
  defaultWordsPerMinute?: number;
}

interface ReadingPaceRange {
  min: number;
  max: number;
}

export const DEFAULT_READING_LANGUAGE = 'en';
export const DEFAULT_READING_CONTENT_TYPE: ReadingContentType = 'general';

export const READING_PACE_RANGES: Record<ReadingContentType, ReadingPaceRange> = {
  general: { min: 100, max: 350 },
  tech: { min: 80, max: 300 },
  academic: { min: 80, max: 280 },
};

export function normalizeReadingPaceLanguage(language: string | undefined): string {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_READING_LANGUAGE;
  }

  return normalized.split(/[-_]/)[0] || DEFAULT_READING_LANGUAGE;
}

export function createReadingPaceProfileId(
  language = DEFAULT_READING_LANGUAGE,
  contentType: ReadingContentType = DEFAULT_READING_CONTENT_TYPE,
): string {
  return `${normalizeReadingPaceLanguage(language)}:${contentType}`;
}

export function clampReadingPaceWpm(
  wordsPerMinute: number,
  contentType: ReadingContentType = DEFAULT_READING_CONTENT_TYPE,
): number {
  const range = READING_PACE_RANGES[contentType];
  const finiteWordsPerMinute = Number.isFinite(wordsPerMinute) ? wordsPerMinute : DEFAULT_BASE_WORDS_PER_MINUTE;
  return Math.min(range.max, Math.max(range.min, finiteWordsPerMinute));
}

export function calculateOnboardingObservedWordsPerMinute(input: OnboardingReadingPaceInput): number {
  if (
    !Number.isFinite(input.readingDurationMs)
    || input.readingDurationMs <= 0
    || !Number.isFinite(input.wordCount)
    || input.wordCount <= 0
  ) {
    return DEFAULT_BASE_WORDS_PER_MINUTE;
  }

  return (input.wordCount * 60_000) / input.readingDurationMs;
}

export function getOnboardingConfidenceWeight(correctAnswers: number, questionCount: number): number {
  const boundedQuestionCount = Math.max(0, Math.floor(questionCount));
  const boundedCorrectAnswers = Math.min(boundedQuestionCount, Math.max(0, Math.floor(correctAnswers)));
  const wrongAnswers = boundedQuestionCount - boundedCorrectAnswers;

  if (wrongAnswers <= 0 && boundedQuestionCount > 0) {
    return 0.35;
  }

  if (wrongAnswers === 1) {
    return 0.15;
  }

  return 0;
}

export function calculateOnboardingBaseWordsPerMinute(input: OnboardingReadingPaceInput): number {
  const contentType = input.contentType ?? DEFAULT_READING_CONTENT_TYPE;
  const defaultWordsPerMinute = clampReadingPaceWpm(input.defaultWordsPerMinute ?? DEFAULT_BASE_WORDS_PER_MINUTE, contentType);
  const observedWordsPerMinute = clampReadingPaceWpm(calculateOnboardingObservedWordsPerMinute(input), contentType);
  const confidenceWeight = getOnboardingConfidenceWeight(input.correctAnswers, input.questionCount);

  return clampReadingPaceWpm(
    defaultWordsPerMinute * (1 - confidenceWeight) + observedWordsPerMinute * confidenceWeight,
    contentType,
  );
}

export function upsertOnboardingReadingPaceProfile(
  existingProfile: ReadingPaceProfile | undefined,
  input: OnboardingReadingPaceInput,
): ReadingPaceProfile | undefined {
  if (getOnboardingConfidenceWeight(input.correctAnswers, input.questionCount) <= 0) {
    return undefined;
  }

  const language = normalizeReadingPaceLanguage(input.language ?? existingProfile?.language);
  const contentType = input.contentType ?? existingProfile?.contentType ?? DEFAULT_READING_CONTENT_TYPE;
  const baseWordsPerMinute = calculateOnboardingBaseWordsPerMinute({
    ...input,
    contentType,
    defaultWordsPerMinute: existingProfile?.baseWordsPerMinute ?? input.defaultWordsPerMinute,
  });

  return {
    id: createReadingPaceProfileId(language, contentType),
    language,
    contentType,
    baseWordsPerMinute,
    adaptiveSampleCount: 0,
    source: 'onboarding',
    updatedAt: input.completedAt,
  };
}

export function updateAdaptiveReadingPaceProfile(
  existingProfile: ReadingPaceProfile | undefined,
  sample: AdaptiveReadingPaceSample | undefined,
  options: AdaptiveReadingPaceProfileOptions,
): ReadingPaceProfile | undefined {
  if (!sample || !Number.isFinite(sample.confidence) || sample.confidence <= 0) {
    return undefined;
  }

  const language = normalizeReadingPaceLanguage(options.language ?? existingProfile?.language);
  const contentType = options.contentType ?? existingProfile?.contentType ?? DEFAULT_READING_CONTENT_TYPE;
  const range = READING_PACE_RANGES[contentType];
  if (!isReasonableObservedWordsPerMinute(sample.observedWordsPerMinute, range)) {
    return undefined;
  }

  const adaptiveSampleCount = Math.max(
    0,
    Math.floor(existingProfile?.adaptiveSampleCount ?? 0),
  );
  const confidenceWeight = Math.min(1, sample.confidence);
  const alpha = getAdaptiveReadingPaceAlpha(adaptiveSampleCount) * confidenceWeight;
  const currentWordsPerMinute = clampReadingPaceWpm(
    existingProfile?.baseWordsPerMinute ?? options.defaultWordsPerMinute ?? DEFAULT_BASE_WORDS_PER_MINUTE,
    contentType,
  );
  const observedWordsPerMinute = clampReadingPaceWpm(sample.observedWordsPerMinute, contentType);

  return {
    id: createReadingPaceProfileId(language, contentType),
    language,
    contentType,
    baseWordsPerMinute: clampReadingPaceWpm(
      currentWordsPerMinute * (1 - alpha) + observedWordsPerMinute * alpha,
      contentType,
    ),
    adaptiveSampleCount: adaptiveSampleCount + 1,
    source: 'adaptive',
    updatedAt: options.now,
  };
}

export function resolveReadingPaceBaseWordsPerMinute(
  profile: Pick<ReadingPaceProfile, 'baseWordsPerMinute' | 'contentType'> | undefined,
): number {
  return clampReadingPaceWpm(profile?.baseWordsPerMinute ?? DEFAULT_BASE_WORDS_PER_MINUTE, profile?.contentType);
}

function getAdaptiveReadingPaceAlpha(adaptiveSampleCount: number): number {
  if (adaptiveSampleCount < 10) {
    return 0.12;
  }

  if (adaptiveSampleCount < 50) {
    return 0.06;
  }

  return 0.03;
}

function isReasonableObservedWordsPerMinute(wordsPerMinute: number, range: ReadingPaceRange): boolean {
  return (
    Number.isFinite(wordsPerMinute) &&
    wordsPerMinute >= range.min * 0.75 &&
    wordsPerMinute <= range.max * 1.25
  );
}
