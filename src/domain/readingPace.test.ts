import { describe, expect, it } from 'vitest';

import {
  calculateOnboardingBaseWordsPerMinute,
  createReadingPaceProfileId,
  updateAdaptiveReadingPaceProfile,
  upsertOnboardingReadingPaceProfile,
} from './readingPace';

describe('reading pace calibration', () => {
  it('blends onboarding observed pace by comprehension confidence', () => {
    const input = {
      wordCount: 240,
      readingDurationMs: 60_000,
      completedAt: 61_000,
      questionCount: 3,
      defaultWordsPerMinute: 220,
    };

    expect(calculateOnboardingBaseWordsPerMinute({ ...input, correctAnswers: 3 })).toBeCloseTo(227, 6);
    expect(calculateOnboardingBaseWordsPerMinute({ ...input, correctAnswers: 2 })).toBeCloseTo(223, 6);
    expect(calculateOnboardingBaseWordsPerMinute({ ...input, correctAnswers: 1 })).toBeCloseTo(220, 6);
  });

  it('clamps onboarding pace to the content-type range', () => {
    expect(
      calculateOnboardingBaseWordsPerMinute({
        contentType: 'academic',
        wordCount: 240,
        readingDurationMs: 15_000,
        completedAt: 16_000,
        correctAnswers: 3,
        questionCount: 3,
        defaultWordsPerMinute: 220,
      }),
    ).toBeLessThanOrEqual(280);
  });

  it('creates an onboarding profile with normalized language and reset adaptive sample count', () => {
    const profile = upsertOnboardingReadingPaceProfile(
      {
        id: createReadingPaceProfileId('en', 'general'),
        language: 'en',
        contentType: 'general',
        baseWordsPerMinute: 180,
        adaptiveSampleCount: 12,
        source: 'adaptive',
        updatedAt: 1,
      },
      {
        language: 'en-US',
        contentType: 'general',
        wordCount: 240,
        readingDurationMs: 60_000,
        completedAt: 61_000,
        correctAnswers: 3,
        questionCount: 3,
      },
    );

    expect(profile).toMatchObject({
      id: 'en:general',
      language: 'en',
      contentType: 'general',
      adaptiveSampleCount: 0,
      source: 'onboarding',
      updatedAt: 61_000,
    });
  });

  it('rejects onboarding timing when comprehension is below the acceptance threshold', () => {
    expect(
      upsertOnboardingReadingPaceProfile(undefined, {
        language: 'en',
        contentType: 'general',
        wordCount: 240,
        readingDurationMs: 60_000,
        completedAt: 61_000,
        correctAnswers: 1,
        questionCount: 3,
      }),
    ).toBeUndefined();
  });

  it('scales the early-sample EMA weight by confidence', () => {
    const updated = updateAdaptiveReadingPaceProfile(
      {
        id: createReadingPaceProfileId('en', 'general'),
        language: 'en',
        contentType: 'general',
        baseWordsPerMinute: 200,
        adaptiveSampleCount: 3,
        source: 'onboarding',
        updatedAt: 1,
      },
      {
        observedWordsPerMinute: 300,
        confidence: 0.5,
      },
      {
        language: 'en',
        contentType: 'general',
        now: 3,
      },
    );

    expect(updated).toMatchObject({
      baseWordsPerMinute: expect.closeTo(206, 6),
      adaptiveSampleCount: 4,
      source: 'adaptive',
      updatedAt: 3,
    });
  });

  it('uses lower EMA weight after many adaptive samples', () => {
    const updated = updateAdaptiveReadingPaceProfile(
      {
        id: createReadingPaceProfileId('en', 'tech'),
        language: 'en',
        contentType: 'tech',
        baseWordsPerMinute: 200,
        adaptiveSampleCount: 50,
        source: 'adaptive',
        updatedAt: 1,
      },
      {
        observedWordsPerMinute: 260,
        confidence: 1,
      },
      {
        language: 'en',
        contentType: 'tech',
        now: 3,
      },
    );

    expect(updated?.baseWordsPerMinute).toBeCloseTo(201.8, 6);
    expect(updated?.adaptiveSampleCount).toBe(51);
  });

  it('rejects nonpositive confidence or outlier adaptive samples', () => {
    const baseProfile = {
      id: createReadingPaceProfileId('en', 'general'),
      language: 'en',
      contentType: 'general' as const,
      baseWordsPerMinute: 200,
      adaptiveSampleCount: 0,
      source: 'onboarding' as const,
      updatedAt: 1,
    };

    expect(
      updateAdaptiveReadingPaceProfile(
        baseProfile,
        { observedWordsPerMinute: 240, confidence: 0 },
        { language: 'en', contentType: 'general', now: 3 },
      ),
    ).toBeUndefined();
    expect(
      updateAdaptiveReadingPaceProfile(
        baseProfile,
        { observedWordsPerMinute: 600, confidence: 0.9 },
        { language: 'en', contentType: 'general', now: 3 },
      ),
    ).toBeUndefined();
  });
});
