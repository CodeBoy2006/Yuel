import { describe, expect, it } from 'vitest';

import { withCrossContextLock } from './crossContextLock';

describe('withCrossContextLock', () => {
  it('serializes fallback tasks when Web Locks are unavailable', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = withCrossContextLock('test-serialization', async () => {
      order.push('first:start');
      await firstGate;
      order.push('first:end');
    });
    const second = withCrossContextLock('test-serialization', async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('releases the fallback queue after a task rejects', async () => {
    await expect(
      withCrossContextLock('test-rejection', async () => {
        throw new Error('mutation failed');
      }),
    ).rejects.toThrow('mutation failed');

    await expect(withCrossContextLock('test-rejection', async () => 'next')).resolves.toBe('next');
  });
});
