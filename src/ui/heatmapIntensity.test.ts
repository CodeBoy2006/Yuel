import { describe, expect, it } from 'vitest';

import {
  createHeatmapIntensityScale,
  getHeatmapIntensityLevel,
} from './heatmapIntensity';

describe('heatmap intensity scale', () => {
  it('returns an empty scale when no positive finite values exist', () => {
    expect(createHeatmapIntensityScale([0, -10, Number.NaN, Number.POSITIVE_INFINITY]))
      .toEqual({ referenceValue: 0 });
  });

  it('uses the maximum value for short histories', () => {
    expect(createHeatmapIntensityScale(Array.from({ length: 19 }, (_, index) => index + 1)))
      .toEqual({ referenceValue: 19 });
  });

  it('clips an isolated high outlier once enough active days exist', () => {
    const values = [
      ...Array.from({ length: 19 }, (_, index) => index + 1),
      1_000,
    ];

    expect(createHeatmapIntensityScale(values)).toEqual({ referenceValue: 19 });
  });

  it('maps positive values into four equal intensity bands and saturates above the reference', () => {
    const scale = { referenceValue: 100 };

    expect(getHeatmapIntensityLevel(0, scale)).toBe(0);
    expect(getHeatmapIntensityLevel(1, scale)).toBe(1);
    expect(getHeatmapIntensityLevel(25, scale)).toBe(1);
    expect(getHeatmapIntensityLevel(26, scale)).toBe(2);
    expect(getHeatmapIntensityLevel(50, scale)).toBe(2);
    expect(getHeatmapIntensityLevel(51, scale)).toBe(3);
    expect(getHeatmapIntensityLevel(75, scale)).toBe(3);
    expect(getHeatmapIntensityLevel(76, scale)).toBe(4);
    expect(getHeatmapIntensityLevel(100, scale)).toBe(4);
    expect(getHeatmapIntensityLevel(1_000, scale)).toBe(4);
  });
});
