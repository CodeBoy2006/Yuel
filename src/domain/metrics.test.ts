import { describe, expect, it } from 'vitest';

import { estimateEffectiveWords } from './metrics';

describe('estimateEffectiveWords', () => {
  it('rewards attentive visible reading more than fast idle skim behavior', () => {
    const attentive = estimateEffectiveWords({
      rawWords: 240,
      visibleRatio: 0.92,
      dwellMs: 78_000,
      activeTab: true,
      scrollSpeedWordsPerMinute: 210,
      idle: false,
      interactionCount: 2,
      repeatViews: 1,
    });

    const skimmed = estimateEffectiveWords({
      rawWords: 240,
      visibleRatio: 0.28,
      dwellMs: 4_000,
      activeTab: false,
      scrollSpeedWordsPerMinute: 1_800,
      idle: true,
      interactionCount: 0,
      repeatViews: 5,
    });

    expect(attentive.effectiveWords).toBeGreaterThan(skimmed.effectiveWords);
    expect(attentive.confidence).toBe('high');
    expect(skimmed.confidence).toBe('low');
    expect(attentive.effectiveWords).toBeLessThanOrEqual(240);
  });
});
