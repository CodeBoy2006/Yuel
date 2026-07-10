export interface ViewportExposureChunkValue {
  chunkId: string;
  wordCount: number;
  visibleRatio: number;
  centerDistance: number;
  contentWeight: number;
  contentMultiplier: number;
  attentionMass?: number;
  visibleWordCount?: number;
  viewportY: number;
}

export interface ViewportExposureTickValue {
  tickMs: number;
  baseWordsPerMinute: number;
  activeTab: boolean;
  documentVisible: boolean;
  scrollSpeedWordsPerMinute: number;
  scrollDirection: -1 | 0 | 1;
  idleAgeMs: number;
  visibleChunks: ViewportExposureChunkValue[];
}

export function decodeViewportExposureTick(value: unknown): ViewportExposureTickValue {
  const tick = readObject(value);

  return {
    tickMs: readNonNegativeNumber(tick, 'tickMs'),
    baseWordsPerMinute: readNonNegativeNumber(tick, 'baseWordsPerMinute'),
    activeTab: readBoolean(tick, 'activeTab', true),
    documentVisible: readBoolean(tick, 'documentVisible', true),
    scrollSpeedWordsPerMinute: readNumber(tick, 'scrollSpeedWordsPerMinute', 0),
    scrollDirection: readScrollDirection(tick),
    idleAgeMs: readNumber(tick, 'idleAgeMs', 0),
    visibleChunks: decodeVisibleChunks(tick?.visibleChunks),
  };
}

function decodeVisibleChunks(value: unknown): ViewportExposureChunkValue[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate): ViewportExposureChunkValue[] => {
    const chunk = readObject(candidate);
    const chunkId = chunk?.chunkId;
    if (typeof chunkId !== 'string' || chunkId.trim().length === 0) return [];

    const contentWeight = readNumber(chunk, 'contentWeight', 0);
    return [{
      chunkId,
      wordCount: readNonNegativeNumber(chunk, 'wordCount'),
      visibleRatio: readNumber(chunk, 'visibleRatio', 0),
      centerDistance: readNumber(chunk, 'centerDistance', 0),
      contentWeight,
      contentMultiplier: readOptionalNumber(chunk, 'contentMultiplier') ?? contentWeight,
      attentionMass: readOptionalNumber(chunk, 'attentionMass'),
      visibleWordCount: readOptionalNumber(chunk, 'visibleWordCount'),
      viewportY: readNumber(chunk, 'viewportY', Number.NaN),
    }];
  });
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumber(value: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback;
}

function readNonNegativeNumber(value: Record<string, unknown> | undefined, key: string): number {
  return Math.max(0, readNumber(value, key, 0));
}

function readOptionalNumber(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}

function readBoolean(value: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const candidate = value?.[key];
  return typeof candidate === 'boolean' ? candidate : fallback;
}

function readScrollDirection(value: Record<string, unknown> | undefined): -1 | 0 | 1 {
  const direction = value?.scrollDirection;
  return direction === -1 || direction === 1 ? direction : 0;
}
