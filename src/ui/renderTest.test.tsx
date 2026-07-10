import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { cleanupSmokeRender, cleanupSmokeRenders, renderForSmoke } from './renderTest';

describe('renderForSmoke cleanup', () => {
  it('unmounts the React root and removes its container', async () => {
    const effectCleanup = vi.fn();
    const Probe = () => {
      useEffect(() => effectCleanup, []);
      return <span>mounted</span>;
    };
    const container = await renderForSmoke(<Probe />);

    expect(container.isConnected).toBe(true);
    await cleanupSmokeRender(container);

    expect(effectCleanup).toHaveBeenCalledOnce();
    expect(container.isConnected).toBe(false);
  });

  it('cleans every tracked render without changing the returned container API', async () => {
    const first = await renderForSmoke(<span>first</span>);
    const second = await renderForSmoke(<span>second</span>);

    expect(first).toBeInstanceOf(HTMLElement);
    expect(second).toBeInstanceOf(HTMLElement);
    await cleanupSmokeRenders();

    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(false);
  });
});
