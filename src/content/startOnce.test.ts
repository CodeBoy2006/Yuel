import { describe, expect, it, vi } from 'vitest';

import { startReadingCollectorOnce, stopReadingCollectorOnce } from './startOnce';

describe('startReadingCollectorOnce', () => {
  it('starts the collector once per page context and reuses the existing controller', () => {
    const pageContext = {};
    const controller = { collecting: true, stop: vi.fn() };
    const startCollector = vi.fn(() => controller);

    const first = startReadingCollectorOnce(pageContext, startCollector);
    const second = startReadingCollectorOnce(pageContext, startCollector);

    expect(first).toBe(controller);
    expect(second).toBe(controller);
    expect(startCollector).toHaveBeenCalledOnce();
  });

  it('stops and clears a collector so the same page can be enabled again', () => {
    const stop = vi.fn();
    const pageContext = { __yuelReadingCollector: { collecting: true, stop } };

    expect(stopReadingCollectorOnce(pageContext)).toBe(true);
    expect(stop).toHaveBeenCalledOnce();
    expect(pageContext.__yuelReadingCollector).toBeUndefined();
  });
});
