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
  static instances: TestIntersectionObserver[] = [];

  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    TestIntersectionObserver.instances.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];

  emit(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function visibleRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 640,
    height: 80,
    top: 0,
    right: 640,
    bottom: 80,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function setWindowScrollY(value: number): void {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value,
  });
}

describe('startReadingCollector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 5, 27, 12, 0, 0));
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect());
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1_800,
    });
    setWindowScrollY(0);
    TestIntersectionObserver.instances = [];
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

  it('batches scroll velocity and attaches it to exposure ticks', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Memory overhead increases quickly when scrolling through dense technical documentation and architecture guides.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    TestIntersectionObserver.instances[0].emit([
      {
        target: blockElement as Element,
        isIntersecting: true,
        intersectionRatio: 1,
      },
    ]);

    await vi.advanceTimersByTimeAsync(500);
    setWindowScrollY(600);
    window.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(500);

    const batch = mocks.sendMessage.mock.calls[0][0];
    expect(batch.payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'ScrollVelocityChanged',
          value: expect.objectContaining({
            scrollSpeedWordsPerMinute: expect.any(Number),
          }),
        }),
        expect.objectContaining({
          kind: 'TextBlockExposureTick',
          value: expect.objectContaining({
            scrollSpeedWordsPerMinute: expect.any(Number),
          }),
        }),
      ]),
    );

    controller.stop();
  });
});
