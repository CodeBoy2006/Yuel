import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startReadingCollector } from './collector';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: mocks.sendMessage,
    },
  },
}));

class TestIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('startReadingCollector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    document.body.innerHTML = '';
    document.title = 'Retryable reading page';
    mocks.sendMessage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps pending events for the next flush when runtime delivery fails', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('message port closed')).mockResolvedValueOnce(undefined);

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    await flushPromises();
    expect(mocks.sendMessage).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage.mock.calls[1][0]).toMatchObject({
      type: 'yuel.readingEvents.batch',
      payload: {
        events: [
          {
            kind: 'PageVisible',
          },
        ],
      },
    });

    controller.stop();
  });
});
