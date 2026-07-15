export const HEATMAP_LEVEL_COUNT = 4;

const HEATMAP_REFERENCE_PERCENTILE = 0.95;

export interface HeatmapIntensityScale {
  referenceValue: number;
}

export function createHeatmapIntensityScale(values: readonly number[]): HeatmapIntensityScale {
  const positiveValues = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (positiveValues.length === 0) {
    return { referenceValue: 0 };
  }

  // A high-percentile ceiling keeps one unusually long day from flattening the rest of the range.
  const referenceIndex = Math.min(
    positiveValues.length - 1,
    Math.ceil(positiveValues.length * HEATMAP_REFERENCE_PERCENTILE) - 1,
  );

  return {
    referenceValue: positiveValues[referenceIndex] ?? 0,
  };
}

export function getHeatmapIntensityLevel(
  value: number,
  scale: HeatmapIntensityScale,
): number {
  if (
    !Number.isFinite(value)
    || value <= 0
    || !Number.isFinite(scale.referenceValue)
    || scale.referenceValue <= 0
  ) {
    return 0;
  }

  const boundedValue = Math.min(value, scale.referenceValue);
  return Math.min(
    HEATMAP_LEVEL_COUNT,
    Math.max(1, Math.ceil((boundedValue / scale.referenceValue) * HEATMAP_LEVEL_COUNT)),
  );
}
