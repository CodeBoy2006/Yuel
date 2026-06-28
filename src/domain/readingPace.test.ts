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
      startedAt: 1_000,
      completedAt: 61_000,
      questionCount: 3,
      defaultWordsPerMinute: 220,
    };

    expect(calculateOnboardingBaseWordsPerMinute({ ...input, correctAnswers: 3 })).toBeCloseTo(233, 6);
    expect(calculateOnboardingBaseWordsPerMinute({ ...input, correctAnswers: 2 })).toBeCloseTo(227, 6);
    expect(calculateOnboardingBaseWordsPerMinute({ ...input, correctAnswers: 1 })).toBeCloseTo(222, 6);
  });

  it('clamps onboarding pace to the content-type range', () => {
    expect(
      calculateOnboardingBaseWordsPerMinute({
        contentType: 'academic',
        wordCount: 240,
        startedAt: 1_000,
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
        sampleCount: 12,
        source: 'adaptive',
        updatedAt: 1,
      },
      {
        language: 'en-US',
        contentType: 'general',
        wordCount: 240,
        startedAt: 1_000,
        completedAt: 61_000,
        correctAnswers: 3,
        questionCount: 3,
      },
    );

    expect(profile).toMatchObject({
      id: 'en:general',
      language: 'en',
      contentType: 'general',
      sampleCount: 0,
      source: 'onboarding',
      updatedAt: 61_000,
    });
  });

  it('updates adaptive pace with the early-sample EMA weight', () => {
    const updated = updateAdaptiveReadingPaceProfile(
      {
        id: createReadingPaceProfileId('en', 'general'),
        language: 'en',
        contentType: 'general',
        baseWordsPerMinute: 200,
        sampleCount: 3,
        source: 'onboarding',
        updatedAt: 1,
      },
      {
        observedWordsPerMinute: 300,
        confidence: 0.9,
        observedAt: 2,
      },
      {
        language: 'en',
        contentType: 'general',
        now: 3,
      },
    );

    expect(updated).toMatchObject({
      baseWordsPerMinute: expect.closeTo(212, 6),
      sampleCount: 4,
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
        sampleCount: 50,
        source: 'adaptive',
        updatedAt: 1,
      },
      {
        observedWordsPerMinute: 260,
        confidence: 0.9,
        observedAt: 2,
      },
      {
        language: 'en',
        contentType: 'tech',
        now: 3,
      },
    );

    expect(updated?.baseWordsPerMinute).toBeCloseTo(201.8, 6);
    expect(updated?.sampleCount).toBe(51);
  });

  it('rejects low-confidence or outlier adaptive samples', () => {
    const baseProfile = {
      id: createReadingPaceProfileId('en', 'general'),
      language: 'en',
      contentType: 'general' as const,
      baseWordsPerMinute: 200,
      sampleCount: 0,
      source: 'onboarding' as const,
      updatedAt: 1,
    };

    expect(
      updateAdaptiveReadingPaceProfile(
        baseProfile,
        { observedWordsPerMinute: 240, confidence: 0.5, observedAt: 2 },
        { language: 'en', contentType: 'general', now: 3 },
      ),
    ).toBeUndefined();
    expect(
      updateAdaptiveReadingPaceProfile(
        baseProfile,
        { observedWordsPerMinute: 600, confidence: 0.9, observedAt: 2 },
        { language: 'en', contentType: 'general', now: 3 },
      ),
    ).toBeUndefined();
  });
});
