import { describe, expect, it } from 'vitest';

import { allocateReadingBudget } from './metrics';

function visibleChunk(overrides: Partial<Parameters<typeof allocateReadingBudget>[0]['visibleChunks'][number]> = {}) {
  return {
    chunkId: 'chunk-1',
    wordCount: 120,
    visibleRatio: 1,
    centerDistance: 0,
    contentWeight: 1,
    sessionEffectiveWords: 0,
    todayEffectiveWords: 0,
    lifetimeEffectiveWords: 0,
    ...overrides,
  };
}

describe('allocateReadingBudget', () => {
  it('allocates one viewport reading budget across simultaneous chunks', () => {
    const estimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 120,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [
        visibleChunk({ chunkId: 'chunk-1' }),
        visibleChunk({ chunkId: 'chunk-2' }),
        visibleChunk({ chunkId: 'chunk-3' }),
      ],
    });

    expect(estimate.tickBudgetWords).toBeCloseTo(120, 6);
    expect(estimate.allocatedWords).toBeCloseTo(120, 6);
    expect(estimate.effectiveReadingMs).toBeCloseTo(60_000, 6);
    expect(estimate.chunkEstimates).toHaveLength(3);
    expect(estimate.chunkEstimates.map((chunk) => chunk.effectiveWords)).toEqual([
      expect.closeTo(40, 6),
      expect.closeTo(40, 6),
      expect.closeTo(40, 6),
    ]);
  });

  it('caps a visible segment by its persistent session and day capacity', () => {
    const estimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 120,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [visibleChunk({ wordCount: 10, visibleRatio: 0.5 })],
    });

    expect(estimate.tickBudgetWords).toBeCloseTo(120, 6);
    expect(estimate.allocatedWords).toBeCloseTo(10, 6);
    expect(estimate.effectiveReadingMs).toBeCloseTo(5_000, 6);
  });

  it('does not allocate effective reading below the segment visibility threshold', () => {
    const estimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 220,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [visibleChunk({ wordCount: 120, visibleRatio: 0.49 })],
    });

    expect(estimate.tickBudgetWords).toBe(0);
    expect(estimate.allocatedWords).toBe(0);
    expect(estimate.effectiveReadingMs).toBe(0);
  });

  it('uses session and day caps while splitting lifetime-new and review words', () => {
    const estimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 120,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [
        visibleChunk({
          wordCount: 120,
          sessionEffectiveWords: 30,
          todayEffectiveWords: 70,
          lifetimeEffectiveWords: 110,
        }),
      ],
    });

    expect(estimate.tickBudgetWords).toBeCloseTo(120, 6);
    expect(estimate.allocatedWords).toBeCloseTo(50, 6);
    expect(estimate.effectiveReadingMs).toBeCloseTo(25_000, 6);
    expect(estimate.chunkEstimates).toEqual([
      expect.objectContaining({
        effectiveWords: expect.closeTo(50, 6),
        newWords: expect.closeTo(10, 6),
        reviewWords: expect.closeTo(40, 6),
      }),
    ]);
  });

  it('records raw exposure without effective allocation for inactive or hidden documents', () => {
    const estimate = allocateReadingBudget({
      tickMs: 30_000,
      baseWordsPerMinute: 120,
      isActiveTab: false,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [visibleChunk()],
    });

    expect(estimate.rawExposureMs).toBe(30_000);
    expect(estimate.tickBudgetWords).toBe(0);
    expect(estimate.allocatedWords).toBe(0);
    expect(estimate.effectiveReadingMs).toBe(0);
    expect(estimate.chunkEstimates[0].effectiveWords).toBe(0);
  });

  it('decays budget from idle age and scroll speed relative to the base WPM', () => {
    const idleEstimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 120,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 120_000,
      visibleChunks: [visibleChunk()],
    });
    const fastScrollEstimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 120,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 600,
      idleAgeMs: 0,
      visibleChunks: [visibleChunk()],
    });

    expect(idleEstimate.tickBudgetWords).toBeCloseTo(42, 6);
    expect(fastScrollEstimate.tickBudgetWords).toBeCloseTo(9.6, 6);
  });

  it('uses content multipliers as local reading rates without shrinking attention time', () => {
    const estimate = allocateReadingBudget({
      tickMs: 15_000,
      baseWordsPerMinute: 220,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [visibleChunk({ wordCount: 100, contentMultiplier: 0.2 })],
    });

    expect(estimate.tickBudgetWords).toBeCloseTo(55, 6);
    expect(estimate.allocatedWords).toBeCloseTo(11, 6);
    expect(estimate.effectiveReadingMs).toBeCloseTo(15_000, 6);
  });

  it('redistributes time left by a segment that reaches its cap', () => {
    const estimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 120,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [
        visibleChunk({ chunkId: 'almost-capped', sessionEffectiveWords: 119, todayEffectiveWords: 119 }),
        visibleChunk({ chunkId: 'available' }),
      ],
    });

    expect(estimate.allocatedWords).toBeCloseTo(120, 6);
    expect(estimate.chunkEstimates).toEqual([
      expect.objectContaining({ chunkId: 'almost-capped', effectiveWords: expect.closeTo(1, 6) }),
      expect.objectContaining({ chunkId: 'available', effectiveWords: expect.closeTo(119, 6) }),
    ]);
    expect(estimate.effectiveReadingMs).toBeCloseTo(60_000, 6);
  });

  it('is invariant to splitting a stable interval into smaller ticks', () => {
    const baseInput = {
      baseWordsPerMinute: 220,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
    };
    const chunk = visibleChunk({ wordCount: 100, contentMultiplier: 0.2 });
    const oneTick = allocateReadingBudget({ ...baseInput, tickMs: 15_000, visibleChunks: [chunk] });
    let sessionEffectiveWords = 0;
    let todayEffectiveWords = 0;
    let splitWords = 0;
    let splitTimeMs = 0;

    for (let index = 0; index < 15; index += 1) {
      const tick = allocateReadingBudget({
        ...baseInput,
        tickMs: 1_000,
        visibleChunks: [visibleChunk({
          wordCount: 100,
          contentMultiplier: 0.2,
          sessionEffectiveWords,
          todayEffectiveWords,
        })],
      });
      splitWords += tick.allocatedWords;
      splitTimeMs += tick.effectiveReadingMs;
      sessionEffectiveWords += tick.allocatedWords;
      todayEffectiveWords += tick.allocatedWords;
    }

    expect(splitWords).toBeCloseTo(oneTick.allocatedWords, 6);
    expect(splitTimeMs).toBeCloseTo(oneTick.effectiveReadingMs, 6);
  });

  it('preserves aggregate attention when a text region is split into additive segments', () => {
    const baseInput = {
      tickMs: 15_000,
      baseWordsPerMinute: 220,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
    };
    const unsplit = allocateReadingBudget({
      ...baseInput,
      visibleChunks: [
        visibleChunk({ chunkId: 'target', attentionMass: 100 }),
        visibleChunk({ chunkId: 'peer', attentionMass: 100 }),
      ],
    });
    const split = allocateReadingBudget({
      ...baseInput,
      visibleChunks: [
        visibleChunk({ chunkId: 'target-a', wordCount: 60, attentionMass: 50 }),
        visibleChunk({ chunkId: 'target-b', wordCount: 60, attentionMass: 50 }),
        visibleChunk({ chunkId: 'peer', attentionMass: 100 }),
      ],
    });
    const unsplitTargetWords = unsplit.chunkEstimates.find((chunk) => chunk.chunkId === 'target')?.effectiveWords ?? 0;
    const splitTargetWords = split.chunkEstimates
      .filter((chunk) => chunk.chunkId.startsWith('target-'))
      .reduce((sum, chunk) => sum + chunk.effectiveWords, 0);

    expect(splitTargetWords).toBeCloseTo(unsplitTargetWords, 6);
    expect(split.allocatedWords).toBeCloseTo(unsplit.allocatedWords, 6);
  });
});
