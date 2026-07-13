import { describe, expect, it } from 'vitest';

import {
  getRectsVisibleRatio,
  measureViewportChunk,
  type RectBounds,
} from './viewportGeometry';

function rect(left: number, top: number, width: number, height: number): RectBounds {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe('viewport geometry', () => {
  it('measures visibility relative to an offset reader viewport', () => {
    const viewport = rect(100, 80, 600, 400);
    const chunkRect = rect(50, 180, 200, 100);

    expect(getRectsVisibleRatio([chunkRect], viewport)).toBe(0.75);
    expect(measureViewportChunk([chunkRect], viewport, 20, 1)).toEqual(
      expect.objectContaining({
        visibleRatio: 0.75,
        visibleWordCount: 15,
        centerDistance: 0.125,
        viewportY: 0.375,
        contentMultiplier: 1,
      }),
    );
  });

  it('weights attention by the visible area of each text rectangle', () => {
    const viewport = rect(0, 0, 600, 400);
    const nearFocus = measureViewportChunk([rect(0, 170, 300, 40)], viewport, 16, 0.8);
    const nearEdge = measureViewportChunk([rect(0, 0, 300, 40)], viewport, 16, 0.8);

    expect(nearFocus?.attentionMass).toBeGreaterThan(nearEdge?.attentionMass ?? 0);
    expect(nearFocus?.contentMultiplier).toBe(0.8);
  });

  it('returns no measurement for empty geometry', () => {
    const viewport = rect(0, 0, 600, 400);

    expect(measureViewportChunk([], viewport, 12, 1)).toBeUndefined();
    expect(getRectsVisibleRatio([], viewport)).toBe(0);
  });
});
