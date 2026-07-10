import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS,
  MAX_DAILY_CHECK_IN_THRESHOLD_WORDS,
  MIN_DAILY_CHECK_IN_THRESHOLD_WORDS,
  hasCompletedDailyCheckIn,
  isValidDailyCheckInThresholdWords,
  normalizeDailyCheckInThresholdWords,
} from './checkIn';

describe('daily check-in rules', () => {
  it('completes a check-in only after reaching the configured effective-word goal', () => {
    expect(hasCompletedDailyCheckIn({ effectiveWords: 499.9 }, 500)).toBe(false);
    expect(hasCompletedDailyCheckIn({ effectiveWords: 500 }, 500)).toBe(true);
    expect(hasCompletedDailyCheckIn({ effectiveWords: 900 }, 500)).toBe(true);
  });

  it('accepts only whole-word goals inside the supported range', () => {
    expect(isValidDailyCheckInThresholdWords(MIN_DAILY_CHECK_IN_THRESHOLD_WORDS)).toBe(true);
    expect(isValidDailyCheckInThresholdWords(MAX_DAILY_CHECK_IN_THRESHOLD_WORDS)).toBe(true);
    expect(isValidDailyCheckInThresholdWords(0)).toBe(false);
    expect(isValidDailyCheckInThresholdWords(500.5)).toBe(false);
    expect(isValidDailyCheckInThresholdWords(MAX_DAILY_CHECK_IN_THRESHOLD_WORDS + 1)).toBe(false);
  });

  it('falls back to the product default for invalid stored values', () => {
    expect(normalizeDailyCheckInThresholdWords(undefined)).toBe(DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS);
    expect(normalizeDailyCheckInThresholdWords(Number.NaN)).toBe(DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS);
  });
});
