import { describe, expect, it } from 'vitest';

import { decodeViewportExposureTick } from './viewportExposure';

describe('viewport exposure value decoding', () => {
  it('normalizes malformed scalar fields and ignores chunks without an identity', () => {
    const decoded = decodeViewportExposureTick({
      tickMs: -100,
      baseWordsPerMinute: Number.NaN,
      activeTab: 'yes',
      documentVisible: false,
      scrollSpeedWordsPerMinute: Number.POSITIVE_INFINITY,
      scrollDirection: 2,
      idleAgeMs: -5,
      visibleChunks: [null, { chunkId: '   ' }, {
        chunkId: 'chunk-1',
        wordCount: -8,
        visibleRatio: 'full',
        contentWeight: 0.4,
        viewportY: Number.POSITIVE_INFINITY,
      }],
    });

    expect(decoded).toEqual({
      tickMs: 0,
      baseWordsPerMinute: 0,
      activeTab: true,
      documentVisible: false,
      scrollSpeedWordsPerMinute: 0,
      scrollDirection: 0,
      idleAgeMs: -5,
      visibleChunks: [{
        chunkId: 'chunk-1',
        wordCount: 0,
        visibleRatio: 0,
        centerDistance: 0,
        contentWeight: 0.4,
        contentMultiplier: 0.4,
        attentionMass: undefined,
        visibleWordCount: undefined,
        viewportY: Number.NaN,
      }],
    });
  });

  it('prefers the current content multiplier while retaining the legacy weight fallback', () => {
    const decoded = decodeViewportExposureTick({
      visibleChunks: [
        { chunkId: 'legacy', contentWeight: 0.2 },
        { chunkId: 'current', contentWeight: 0.2, contentMultiplier: 0.8 },
      ],
    });

    expect(decoded.visibleChunks.map(({ chunkId, contentMultiplier }) => ({ chunkId, contentMultiplier }))).toEqual([
      { chunkId: 'legacy', contentMultiplier: 0.2 },
      { chunkId: 'current', contentMultiplier: 0.8 },
    ]);
  });
});
