export const DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS = 500;
export const MIN_DAILY_CHECK_IN_THRESHOLD_WORDS = 1;
export const MAX_DAILY_CHECK_IN_THRESHOLD_WORDS = 100_000;

export function isValidDailyCheckInThresholdWords(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_DAILY_CHECK_IN_THRESHOLD_WORDS
    && value <= MAX_DAILY_CHECK_IN_THRESHOLD_WORDS
  );
}

export function normalizeDailyCheckInThresholdWords(value: unknown): number {
  return isValidDailyCheckInThresholdWords(value)
    ? value
    : DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS;
}

export function hasCompletedDailyCheckIn(
  reading: { effectiveWords: number },
  thresholdWords: number,
): boolean {
  return (
    Number.isFinite(reading.effectiveWords)
    && reading.effectiveWords >= normalizeDailyCheckInThresholdWords(thresholdWords)
  );
}
