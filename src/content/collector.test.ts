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

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
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
    setDocumentVisibility('visible');
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

  it('does not emit PageVisible until a hidden tab becomes visible', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    setDocumentVisibility('hidden');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      expect(mocks.sendMessage).not.toHaveBeenCalled();

      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      expect(mocks.sendMessage.mock.calls[0][0].payload.events).toEqual([
        expect.objectContaining({
          kind: 'PageVisible',
        }),
      ]);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('does not emit idle activity while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    setDocumentVisibility('hidden');

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });

    try {
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1_500);
      await flushPromises();

      expect(mocks.sendMessage).not.toHaveBeenCalled();

      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      expect(mocks.sendMessage.mock.calls[0][0].payload.events).toEqual([
        expect.objectContaining({
          kind: 'PageVisible',
        }),
      ]);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('ignores intersection updates while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Hidden technical articles should not record visible reading exposure before the user returns.</p>
      </article>
    `;
    setDocumentVisibility('hidden');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      TestIntersectionObserver.instances[0].emit([
        {
          target: blockElement as Element,
          isIntersecting: true,
          intersectionRatio: 1,
        },
      ]);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).not.toHaveBeenCalled();

      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      expect(mocks.sendMessage.mock.calls[0][0].payload.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'PageVisible',
          }),
          expect.objectContaining({
            kind: 'TextBlockVisible',
          }),
        ]),
      );
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('ignores scroll velocity updates while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Hidden scrolling through dense technical documentation should not affect local reading velocity.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      setDocumentVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      mocks.sendMessage.mockClear();

      await vi.advanceTimersByTimeAsync(500);
      setWindowScrollY(600);
      window.dispatchEvent(new Event('scroll'));
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).not.toHaveBeenCalled();
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('ignores selection telemetry while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    vi.spyOn(document, 'getSelection').mockReturnValue({
      toString: () => 'hidden selected text',
    } as Selection);

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      setDocumentVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      mocks.sendMessage.mockClear();

      document.dispatchEvent(new Event('selectionchange'));
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).not.toHaveBeenCalled();
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('ignores user activity while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      await vi.advanceTimersByTimeAsync(600);
      setDocumentVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      mocks.sendMessage.mockClear();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).not.toHaveBeenCalled();
    } finally {
      controller.stop();
      await flushPromises();
    }
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

  it('marks exposure ticks as idle after the user stops interacting', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Long visible documentation pages should not count as active reading after the user leaves the browser idle.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });
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

    await vi.advanceTimersByTimeAsync(1_000);

    const batch = mocks.sendMessage.mock.calls[0][0];
    expect(batch.payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'UserIdle',
          value: expect.objectContaining({
            idleMs: 500,
          }),
        }),
        expect.objectContaining({
          kind: 'TextBlockExposureTick',
          value: expect.objectContaining({
            idle: true,
          }),
        }),
      ]),
    );

    controller.stop();
  });

  it('emits an active event and resumes non-idle exposure after user interaction', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Active reading should resume when keyboard input follows an idle visible documentation session.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });
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

    await vi.advanceTimersByTimeAsync(600);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await vi.advanceTimersByTimeAsync(400);

    const batch = mocks.sendMessage.mock.calls[0][0];
    expect(batch.payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'UserIdle',
        }),
        expect.objectContaining({
          kind: 'UserActive',
          value: expect.objectContaining({
            idleMs: 100,
          }),
        }),
        expect.objectContaining({
          kind: 'TextBlockExposureTick',
          value: expect.objectContaining({
            idle: false,
          }),
        }),
      ]),
    );

    controller.stop();
  });

  it('keeps final visibilitychange exposure active for the visible dwell window', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Visible reading before a tab is hidden should still count as active exposure time.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });

    try {
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
      setDocumentVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      const batch = mocks.sendMessage.mock.calls[0][0];
      expect(batch.payload.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'TextBlockExposureTick',
            value: expect.objectContaining({
              dwellMs: 500,
              activeTab: true,
            }),
          }),
          expect.objectContaining({
            kind: 'PageHidden',
          }),
        ]),
      );
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('resumes exposure ticks for visible blocks after the tab becomes visible again', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Visible documentation should continue accumulating local reading exposure after returning to the tab.</p>
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
    setDocumentVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    mocks.sendMessage.mockClear();

    setDocumentVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1_000);

    const batch = mocks.sendMessage.mock.calls[0][0];
    expect(batch.payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'TextBlockExposureTick',
          chunkId: expect.any(String),
          value: expect.objectContaining({
            activeTab: true,
          }),
        }),
      ]),
    );

    controller.stop();
  });

  it('flushes open exposure when the page is hidden by navigation before the next interval', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Navigation away from a technical article should preserve the final visible reading exposure locally.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
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
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    const batch = mocks.sendMessage.mock.calls[0][0];
    expect(batch.payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'TextBlockExposureTick',
          value: expect.objectContaining({
            dwellMs: 500,
            activeTab: true,
          }),
        }),
        expect.objectContaining({
          kind: 'PageHidden',
        }),
      ]),
    );

    controller.stop();
  });

  it('retries the final stop flush once when runtime delivery fails', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Stopping a collector should still preserve final visible reading exposure when delivery briefly fails.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
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
    mocks.sendMessage.mockRejectedValueOnce(new Error('message port closed')).mockResolvedValueOnce(undefined);

    controller.stop();
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage.mock.calls[1][0].payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'TextBlockExposureTick',
          value: expect.objectContaining({
            dwellMs: 500,
          }),
        }),
      ]),
    );
  });

  it('orders final stop exposure before the page hidden event', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Stopping a visible reading session should keep exposure before the lifecycle hidden event.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
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
    controller.stop();
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    const eventKinds = mocks.sendMessage.mock.calls[0][0].payload.events.map((event: { kind: string }) => event.kind);
    expect(eventKinds).toEqual(['TextBlockVisible', 'TextBlockExposureTick', 'PageHidden']);
  });

  it('emits PageHidden when stopping a visible page collector', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    controller.stop();
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    expect(mocks.sendMessage.mock.calls[0][0].payload.events).toEqual([
      expect.objectContaining({
        kind: 'PageHidden',
      }),
    ]);
  });

  it('does not flush again when the collector is stopped twice', async () => {
    mocks.sendMessage.mockResolvedValue(undefined);
    document.body.innerHTML = `
      <article>
        <p id="guide">Repeated collector stops should not duplicate visible reading exposure after cleanup completes.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
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
    controller.stop();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    controller.stop();
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });
});
