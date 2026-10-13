const VIEWPORT_ATTENTION_MEAN = 0.492;
const VIEWPORT_ATTENTION_STANDARD_DEVIATION = 0.201;

export interface RectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ViewportChunkMeasurement {
  visibleRatio: number;
  visibleWordCount: number;
  centerDistance: number;
  viewportY: number;
  attentionMass: number;
  contentMultiplier: number;
}

export function measureViewportChunk(
  rects: RectBounds[],
  viewport: RectBounds,
  wordCount: number,
  contentMultiplier: number,
): ViewportChunkMeasurement | undefined {
  const totalArea = rects.reduce((sum, rect) => sum + getRectArea(rect), 0);
  if (totalArea <= 0) {
    return undefined;
  }

  const visibleArea = rects.reduce((sum, rect) => sum + getVisibleArea(rect, viewport), 0);
  const visibleRatio = visibleArea / totalArea;
  const boundingRect = getBoundingRect(rects);
  const viewportHeight = Math.max(1, viewport.height);
  const viewportCenterY = viewport.top + viewportHeight / 2;
  const chunkCenterY = boundingRect.top + boundingRect.height / 2;

  return {
    visibleRatio,
    visibleWordCount: Math.max(0, wordCount) * visibleRatio,
    centerDistance: Math.max(0, Math.abs(chunkCenterY - viewportCenterY) / viewportHeight),
    viewportY: (chunkCenterY - viewport.top) / viewportHeight,
    attentionMass: getAttentionMass(rects, viewport, wordCount, totalArea),
    contentMultiplier,
  };
}

export function getRectsVisibleRatio(rects: RectBounds[], viewport: RectBounds): number {
  const totalArea = rects.reduce((sum, rect) => sum + getRectArea(rect), 0);
  if (totalArea <= 0) {
    return 0;
  }

  const visibleArea = rects.reduce((sum, rect) => sum + getVisibleArea(rect, viewport), 0);
  return visibleArea / totalArea;
}

function getAttentionMass(
  rects: RectBounds[],
  viewport: RectBounds,
  wordCount: number,
  totalArea: number,
): number {
  const viewportHeight = Math.max(1, viewport.height);

  return rects.reduce((sum, rect) => {
    const visibleArea = getVisibleArea(rect, viewport);
    if (visibleArea <= 0) {
      return sum;
    }

    const visibleWordMass = Math.max(0, wordCount) * visibleArea / totalArea;
    const visibleTop = Math.max(viewport.top, Math.min(viewport.bottom, rect.top));
    const visibleBottom = Math.max(visibleTop, Math.min(viewport.bottom, rect.bottom));
    const viewportY = ((visibleTop + visibleBottom) / 2 - viewport.top) / viewportHeight;
    const normalizedDistance =
      (viewportY - VIEWPORT_ATTENTION_MEAN) / VIEWPORT_ATTENTION_STANDARD_DEVIATION;
    const gaussianWeight = Math.exp(-0.5 * normalizedDistance * normalizedDistance);

    return sum + visibleWordMass * gaussianWeight;
  }, 0);
}

function getBoundingRect(rects: RectBounds[]): RectBounds {
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function getRectArea(rect: RectBounds): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getVisibleArea(rect: RectBounds, viewport: RectBounds): number {
  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top),
  );

  return visibleWidth * visibleHeight;
}
