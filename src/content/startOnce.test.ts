import { describe, expect, it, vi } from 'vitest';

import { startReadingCollectorOnce } from './startOnce';

describe('startReadingCollectorOnce', () => {
  it('starts the collector once per page context and reuses the existing controller', () => {
    const pageContext = {};
    const controller = { stop: vi.fn() };
    const startCollector = vi.fn(() => controller);

    const first = startReadingCollectorOnce(pageContext, startCollector);
    const second = startReadingCollectorOnce(pageContext, startCollector);

    expect(first).toBe(controller);
    expect(second).toBe(controller);
    expect(startCollector).toHaveBeenCalledOnce();
  });
});
