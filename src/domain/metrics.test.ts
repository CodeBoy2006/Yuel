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

  it('reduces the tick budget when visible text supply is too small', () => {
    const estimate = allocateReadingBudget({
      tickMs: 60_000,
      baseWordsPerMinute: 120,
      isActiveTab: true,
      isDocumentVisible: true,
      scrollSpeedWordsPerMinute: 0,
      idleAgeMs: 0,
      visibleChunks: [visibleChunk({ wordCount: 10, visibleRatio: 0.5 })],
    });

    expect(estimate.tickBudgetWords).toBeCloseTo(7.5, 6);
    expect(estimate.allocatedWords).toBeCloseTo(7.5, 6);
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
});
