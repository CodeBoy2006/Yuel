import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPageId } from '../domain/events';
import { MESSAGE_TYPES } from '../messaging/contracts';
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

function visibleIntersectionEntry(
  target: Element,
  intersectionRatio = 1,
): Partial<IntersectionObserverEntry> {
  return { target, isIntersecting: true, intersectionRatio };
}

function setGuideText(text: string): void {
  document.body.innerHTML = `<article><p id="guide">${text}</p></article>`;
}

function emitFirstIntersection(target: Element, intersectionRatio = 1): void {
  TestIntersectionObserver.instances[0].emit([
    visibleIntersectionEntry(target, intersectionRatio),
  ]);
}

class TestMutationObserver {
  static instances: TestMutationObserver[] = [];

  private readonly callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
    TestMutationObserver.instances.push(this);
  }

  observe = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];

  emit(records: Partial<MutationRecord>[]) {
    this.callback(records as MutationRecord[], this as unknown as MutationObserver);
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

function belowViewportRect(): DOMRect {
  return {
    ...visibleRect(),
    y: 240,
    top: 240,
    bottom: 320,
  };
}

function partiallyVisibleRect(visibleRatio: number): DOMRect {
  const height = 80;
  const visibleHeight = height * visibleRatio;

  return {
    ...visibleRect(),
    y: visibleHeight - height,
    top: visibleHeight - height,
    bottom: visibleHeight,
  };
}

function tallPartiallyVisibleRect(height: number): DOMRect {
  return {
    ...visibleRect(),
    height,
    bottom: height,
    toJSON: () => ({}),
  } as DOMRect;
}

function domRectList(rects: DOMRect[]): DOMRectList {
  return {
    length: rects.length,
    item: (index: number) => rects[index] ?? null,
    [Symbol.iterator]: function* () {
      yield* rects;
    },
  } as DOMRectList;
}

function mockRangeClientRects(rectsByRangeIndex: DOMRect[][]): void {
  const originalCreateRange = document.createRange.bind(document);
  let rangeIndex = 0;

  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = originalCreateRange();
    const rects = rectsByRangeIndex[rangeIndex] ?? [];
    rangeIndex += 1;
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => domRectList(rects),
    });
    return range;
  });
}

function longReadableParagraph(sentenceCount = 10): string {
  return Array.from(
    { length: sentenceCount },
    (_, index) =>
      `Section ${index + 1} explains how budgeted reading analytics allocate viewport attention across visible documentation paragraphs without duplicating effective reading speed.`,
  ).join(' ');
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
    vi.stubGlobal('MutationObserver', TestMutationObserver);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
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
    TestMutationObserver.instances = [];
    document.documentElement.lang = '';
    document.body.innerHTML = `
      <article>
        <p id="default-guide">Default documentation content should keep collector lifecycle tests focused on reading events.</p>
      </article>
    `;
    document.title = 'Retryable reading page';
    mocks.sendMessage.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps pending events for the next flush when runtime delivery fails', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('message port closed')).mockResolvedValueOnce({ ok: true });

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });
    expect(controller.collecting).toBe(true);

    await flushPromises();
    expect(mocks.sendMessage).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage.mock.calls[1][0]).toMatchObject({
      type: MESSAGE_TYPES.readingPageSnapshotRegister,
      payload: {
        events: [
          {
            kind: 'PageVisible',
          },
        ],
      },
    });

    controller.stop();
    expect(controller.collecting).toBe(false);
  });

  it('keeps pending events when the background reports a failed write', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    await flushPromises();
    expect(mocks.sendMessage).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage.mock.calls[1][0]).toMatchObject({
      type: MESSAGE_TYPES.readingPageSnapshotRegister,
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
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setDocumentVisibility('hidden');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      expect(mocks.sendMessage).not.toHaveBeenCalled();

      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      expect(mocks.sendMessage.mock.calls[0][0].payload.events[0]).toEqual(
        expect.objectContaining({
          kind: 'PageVisible',
        }),
      );
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('starts collection from English text even when the page declares another language', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    document.documentElement.lang = 'zh-CN';
    setGuideText('Technical documentation should remain eligible for local English reading capture when the page declares another language.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });

    try {
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(TestIntersectionObserver.instances).toHaveLength(1);
      expect(mocks.sendMessage).toHaveBeenCalled();
      expect(mocks.sendMessage.mock.calls[0][0].payload).toEqual(
        expect.objectContaining({
          chunks: [
            expect.objectContaining({
              selector: 'p#guide',
            }),
          ],
          page: expect.objectContaining({
            language: 'en',
          }),
        }),
      );
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('does not start collection for pages without English reading text', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    document.documentElement.lang = 'en-US';
    setGuideText('这篇文章介绍浏览器扩展的权限模型、内容脚本、后台服务和本地数据处理流程。');

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });

    try {
      expect(controller.collecting).toBe(false);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(TestIntersectionObserver.instances).toHaveLength(0);
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('uses the same text snapshot for page totals and flushed chunks', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Dynamic pages should keep page word totals aligned with emitted chunk snapshots.');
    const hiddenRect = {
      ...visibleRect(),
      width: 0,
      height: 0,
    };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementationOnce(visibleRect)
      .mockReturnValue(hiddenRect);

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      const batch = mocks.sendMessage.mock.calls[0][0];
      const chunkWords = batch.payload.chunks.reduce(
        (sum: number, chunk: { wordCount: number }) => sum + chunk.wordCount,
        0,
      );
      expect(batch.payload.chunks).toHaveLength(1);
      expect(batch.payload.page.totalWords).toBe(chunkWords);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('refreshes text blocks after SPA content is injected into the current route', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    document.body.innerHTML = `
      <article id="article">
        <p id="initial">Initial route content should start the local reading collector normally.</p>
      </article>
    `;

    const controller = startReadingCollector({ dynamicRefreshDebounceMs: 250, flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      const initialSessionId = mocks.sendMessage.mock.calls[0][0].payload.events[0].sessionId;
      mocks.sendMessage.mockClear();

      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();
      expect(mocks.sendMessage.mock.calls.some((call) => call[0].payload.events.some(
        (event: { kind: string; sessionId: string }) =>
          event.kind === 'ScrollCoordinatesReset' && event.sessionId === initialSessionId,
      ))).toBe(true);
      mocks.sendMessage.mockClear();

      const article = document.querySelector('#article');
      expect(article).toBeInstanceOf(HTMLElement);
      const appended = document.createElement('p');
      appended.id = 'injected';
      appended.textContent =
        'Injected infinite scroll content should become a captured reading block after the SPA updates the DOM.';
      article?.append(appended);
      TestMutationObserver.instances[0].emit([
        {
          type: 'childList',
          target: article as Node,
          addedNodes: [appended] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
        },
      ]);

      await vi.advanceTimersByTimeAsync(250);
      await flushPromises();

      expect(mocks.sendMessage).toHaveBeenCalled();
      const sentBatches = mocks.sendMessage.mock.calls.map((call) => call[0]);
      expect(sentBatches.some((batch) => batch.payload.events.some(
        (event: { kind: string; sessionId: string }) =>
          event.kind === 'ScrollCoordinatesReset' && event.sessionId === initialSessionId,
      ))).toBe(true);
      const refreshedBatch = sentBatches.at(-1);
      expect(refreshedBatch.payload.chunks.map((chunk: { selector: string }) => chunk.selector)).toContain('p#injected');
      expect(refreshedBatch.payload.events).toEqual([
        expect.objectContaining({
          kind: 'PageVisible',
          sessionId: initialSessionId,
        }),
      ]);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('starts a new page snapshot after client-side route navigation', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    document.body.innerHTML = `
      <article>
        <p id="first-route">First route content should be flushed before client-side navigation replaces it.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000, routeCheckIntervalMs: 250 });

    try {
      await flushPromises();
      const initialSessionId = mocks.sendMessage.mock.calls[0][0].payload.events[0].sessionId;
      mocks.sendMessage.mockClear();

      window.history.pushState({}, '', '/next-route');
      document.body.innerHTML = `
        <article>
          <p id="next-route">Next route content should create a new local page snapshot after SPA navigation.</p>
        </article>
      `;
      await vi.advanceTimersByTimeAsync(250);
      await flushPromises();

      expect(mocks.sendMessage).toHaveBeenCalled();
      const sentBatches = mocks.sendMessage.mock.calls.map((call) => call[0]);
      expect(sentBatches.some((batch) => batch.payload.events.some((event: { kind: string }) => event.kind === 'PageHidden'))).toBe(
        true,
      );
      const nextRouteBatch = sentBatches.at(-1);
      expect(nextRouteBatch.payload.page.pageId).toBe(createPageId(window.location.href));
      expect(nextRouteBatch.payload.chunks.map((chunk: { selector: string }) => chunk.selector)).toEqual(['p#next-route']);
      expect(nextRouteBatch.payload.events).toEqual([
        expect.objectContaining({
          kind: 'PageVisible',
        }),
      ]);
      expect(nextRouteBatch.payload.events[0].sessionId).not.toBe(initialSessionId);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('does not emit idle activity while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
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
      const eventKinds = mocks.sendMessage.mock.calls[0][0].payload.events.map((event: { kind: string }) => event.kind);
      expect(eventKinds[0]).toBe('PageVisible');
      expect(eventKinds).not.toContain('UserIdle');
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('ignores intersection updates while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Hidden technical articles should not record visible reading exposure before the user returns.');
    setDocumentVisibility('hidden');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element);

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

  it('orders page visible before restored block visibility when a hidden tab becomes visible', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Restored visible documentation blocks should follow the page visible lifecycle event.');
    setDocumentVisibility('hidden');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();

      setDocumentVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      const eventKinds = mocks.sendMessage.mock.calls[0][0].payload.events.map(
        (event: { kind: string }) => event.kind,
      );
      expect(eventKinds).toEqual(['PageVisible', 'TextBlockVisible', 'TextViewportExposureTick']);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('does not emit hidden block events for blocks that were never visible', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Below threshold documentation blocks should not create hidden events before becoming visible.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element, 0.1);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).not.toHaveBeenCalled();
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('emits exposure before a visible block hidden event when the block leaves the viewport', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Visible documentation blocks should emit a hidden lifecycle event after leaving the viewport.');
    const controller = startReadingCollector({ flushIntervalMs: 10_000, sampleIntervalMs: 10_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      const observer = TestIntersectionObserver.instances[0];
      observer.emit([visibleIntersectionEntry(blockElement as Element)]);

      await vi.advanceTimersByTimeAsync(500);
      const hiddenAt = Date.now();
      observer.emit([{ target: blockElement as Element, isIntersecting: false, intersectionRatio: 0.1 }]);
      await vi.advanceTimersByTimeAsync(9_500);
      await flushPromises();

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      const events = mocks.sendMessage.mock.calls[0][0].payload.events;
      expect(events.map((event: { kind: string }) => event.kind)).toEqual(
        ['TextBlockVisible', 'TextViewportExposureTick', 'TextBlockHidden'],
      );
      const [visibleEvent, exposureEvent, hiddenEvent] = events;
      expect(exposureEvent).toEqual(expect.objectContaining({
        kind: 'TextViewportExposureTick',
        occurredAt: hiddenAt,
        value: expect.objectContaining({ tickMs: 500 }),
      }));
      expect(hiddenEvent).toEqual({
        id: expect.stringMatching(/^TextBlockHidden_/),
        sessionId: visibleEvent.sessionId,
        pageId: createPageId(window.location.href),
        chunkId: visibleEvent.chunkId,
        kind: 'TextBlockHidden',
        occurredAt: hiddenAt,
        confidence: 'medium',
        value: {
          visibleRatio: 0.1,
          wordCount: visibleEvent.value.wordCount,
        },
      });
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('does not duplicate visible block events while a block stays visible', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Repeated visible observer updates should update exposure state without duplicating lifecycle events.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element, 0.2);
      emitFirstIntersection(blockElement as Element, 0.9);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      const eventKinds = mocks.sendMessage.mock.calls[0][0].payload.events.map(
        (event: { kind: string }) => event.kind,
      );
      expect(eventKinds).toEqual(['TextBlockVisible', 'TextViewportExposureTick']);
      expect(mocks.sendMessage.mock.calls[0][0].payload.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'TextViewportExposureTick',
            value: expect.objectContaining({
              tickMs: 1_000,
              visibleChunks: [
                expect.objectContaining({
                  visibleRatio: 1,
                  centerDistance: expect.any(Number),
                  contentWeight: 1,
                }),
              ],
            }),
          }),
        ]),
      );
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('uses the current viewport visible ratio in exposure ticks instead of the historical maximum', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Viewport exposure should reflect the visible text available at the time the tick closes.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element, 0.9);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(partiallyVisibleRect(0.25));

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      const viewportTick = mocks.sendMessage.mock.calls[0][0].payload.events.find(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      expect(viewportTick).toEqual(
        expect.objectContaining({
          value: expect.objectContaining({
            visibleChunks: [
              expect.objectContaining({
                visibleRatio: 0.25,
              }),
            ],
          }),
        }),
      );
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('emits one viewport exposure tick for multiple simultaneously visible blocks', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    document.body.innerHTML = `
      <article>
        <p id="first">Budgeted reading exposure should allocate one viewport budget across visible article paragraphs.</p>
        <p id="second">Multiple visible chunks must not each receive a full independent reading speed allowance.</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const firstBlock = document.querySelector('#first');
      const secondBlock = document.querySelector('#second');
      expect(firstBlock).toBeInstanceOf(HTMLElement);
      expect(secondBlock).toBeInstanceOf(HTMLElement);
      TestIntersectionObserver.instances[0].emit([
        visibleIntersectionEntry(firstBlock as Element),
        visibleIntersectionEntry(secondBlock as Element, 0.75),
      ]);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      const viewportTick = mocks.sendMessage.mock.calls[0][0].payload.events.find(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      expect(viewportTick).toEqual(
        expect.objectContaining({
          value: expect.objectContaining({
            tickMs: 1_000,
            visibleChunks: [
              expect.objectContaining({
                visibleRatio: 1,
                visibleWordCount: expect.any(Number),
                attentionMass: expect.any(Number),
                contentMultiplier: 1,
                contentWeight: 1,
                viewportY: expect.any(Number),
              }),
              expect.objectContaining({
                visibleRatio: 1,
                visibleWordCount: expect.any(Number),
                attentionMass: expect.any(Number),
                contentMultiplier: 1,
                contentWeight: 1,
                viewportY: expect.any(Number),
              }),
            ],
          }),
        }),
      );
      expect(viewportTick).not.toHaveProperty('chunkId');
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('emits viewport exposure only for split chunks that are visible within a long text element', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    document.body.innerHTML = `
      <article>
        <p id="long">${longReadableParagraph()}</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      const registeredChunks = mocks.sendMessage.mock.calls[0][0].payload.chunks;
      mocks.sendMessage.mockClear();

      const longBlock = document.querySelector('#long');
      expect(longBlock).toBeInstanceOf(HTMLElement);
      const longBlockElement = longBlock as HTMLElement;
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 200,
      });
      vi.spyOn(longBlockElement, 'getBoundingClientRect').mockReturnValue(tallPartiallyVisibleRect(400));
      emitFirstIntersection(longBlockElement);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      const batch = mocks.sendMessage.mock.calls[0][0];
      const viewportTick = batch.payload.events.find(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      const visibleChunkIds = viewportTick.value.visibleChunks.map((chunk: { chunkId: string }) => chunk.chunkId);

      expect(registeredChunks.length).toBeGreaterThan(1);
      expect(registeredChunks.every((chunk: { wordCount: number }) => chunk.wordCount <= 24)).toBe(true);
      expect(visibleChunkIds.length).toBeGreaterThan(0);
      expect(visibleChunkIds.length).toBeLessThan(registeredChunks.length);
      expect(visibleChunkIds).toContain(registeredChunks[0].chunkId);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('uses text range client rects instead of element-height slicing for split chunks', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    mockRangeClientRects([
      [belowViewportRect()],
      [visibleRect()],
      ...Array.from({ length: 20 }, () => [belowViewportRect()]),
    ]);
    document.body.innerHTML = `
      <article>
        <p id="long">${longReadableParagraph()}</p>
      </article>
    `;

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      const registeredChunks = mocks.sendMessage.mock.calls[0][0].payload.chunks;
      mocks.sendMessage.mockClear();

      const longBlock = document.querySelector('#long');
      expect(longBlock).toBeInstanceOf(HTMLElement);
      const longBlockElement = longBlock as HTMLElement;
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 200,
      });
      vi.spyOn(longBlockElement, 'getBoundingClientRect').mockReturnValue(tallPartiallyVisibleRect(400));
      emitFirstIntersection(longBlockElement);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      const batch = mocks.sendMessage.mock.calls[0][0];
      const viewportTick = batch.payload.events.find(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      const visibleChunkIds = viewportTick.value.visibleChunks.map((chunk: { chunkId: string }) => chunk.chunkId);

      expect(registeredChunks.length).toBeGreaterThan(1);
      expect(visibleChunkIds).toEqual([registeredChunks[1].chunkId]);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('ignores scroll velocity updates while a tab remains hidden', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Hidden scrolling through dense technical documentation should not affect local reading velocity.');

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
    mocks.sendMessage.mockResolvedValue({ ok: true });
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
    mocks.sendMessage.mockResolvedValue({ ok: true });

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
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Memory overhead increases quickly when scrolling through dense technical documentation and architecture guides.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

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
            scrollDirection: 1,
            scrollSpeedWordsPerMinute: expect.any(Number),
          }),
        }),
        expect.objectContaining({
          kind: 'TextViewportExposureTick',
          value: expect.objectContaining({
            scrollDirection: 1,
            scrollSpeedWordsPerMinute: expect.any(Number),
          }),
        }),
      ]),
    );

    controller.stop();
  });

  it('samples exposure on a one-second heartbeat independently of batch delivery', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Stable heartbeat sampling should preserve reading intervals even when runtime batches are delivered less frequently.');

    const controller = startReadingCollector({ flushIntervalMs: 5_000, sampleIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element);

      await vi.advanceTimersByTimeAsync(4_000);
      expect(mocks.sendMessage).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      expect(mocks.sendMessage).toHaveBeenCalledOnce();
      const exposureTicks = mocks.sendMessage.mock.calls[0][0].payload.events.filter(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      expect(exposureTicks).toHaveLength(5);
      expect(exposureTicks.every((event: { value: { tickMs: number } }) => event.value.tickMs === 1_000)).toBe(true);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('expires stale scroll velocity instead of applying it to later reading ticks', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Brief scrolling should not suppress later attentive reading after the motion signal becomes stale.');

    const controller = startReadingCollector({
      flushIntervalMs: 2_000,
      sampleIntervalMs: 250,
      scrollSpeedExpiryMs: 750,
    });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element);

      await vi.advanceTimersByTimeAsync(500);
      setWindowScrollY(600);
      window.dispatchEvent(new Event('scroll'));
      await vi.advanceTimersByTimeAsync(1_500);
      await flushPromises();

      const exposureTicks = mocks.sendMessage.mock.calls[0][0].payload.events.filter(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      expect(exposureTicks.some((event: { value: { scrollSpeedWordsPerMinute: number } }) =>
        event.value.scrollSpeedWordsPerMinute > 0,
      )).toBe(true);
      expect(exposureTicks.at(-1)?.value).toEqual(
        expect.objectContaining({
          scrollDirection: 0,
          scrollSpeedWordsPerMinute: 0,
        }),
      );
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('marks visible dwell as inactive while the browser window is unfocused', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Window focus should gate attention even while the document remains technically visible.');

    const controller = startReadingCollector({ flushIntervalMs: 1_500, sampleIntervalMs: 500 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element);

      await vi.advanceTimersByTimeAsync(500);
      window.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      const exposureTicks = mocks.sendMessage.mock.calls[0][0].payload.events.filter(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      expect(exposureTicks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: expect.objectContaining({ activeTab: true }) }),
          expect.objectContaining({ value: expect.objectContaining({ activeTab: false }) }),
        ]),
      );
      expect(exposureTicks
        .filter((event: { value: { activeTab: boolean } }) => !event.value.activeTab)
        .reduce((sum: number, event: { value: { tickMs: number } }) => sum + event.value.tickMs, 0))
        .toBe(1_000);
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('starts with attention disabled when the document is already unfocused', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    vi.mocked(document.hasFocus).mockReturnValue(false);
    setGuideText('Collector startup should respect an already unfocused browser window before any blur event arrives.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element);

      await vi.advanceTimersByTimeAsync(1_000);
      await flushPromises();

      const exposureTick = mocks.sendMessage.mock.calls[0][0].payload.events.find(
        (event: { kind: string }) => event.kind === 'TextViewportExposureTick',
      );
      expect(exposureTick.value).toEqual(expect.objectContaining({ activeTab: false }));
    } finally {
      controller.stop();
      await flushPromises();
    }
  });

  it('marks exposure ticks as idle after the user stops interacting', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Long visible documentation pages should not count as active reading after the user leaves the browser idle.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

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
          kind: 'TextViewportExposureTick',
          value: expect.objectContaining({
            idleAgeMs: 1_000,
          }),
        }),
      ]),
    );

    controller.stop();
  });

  it('emits an active event and resumes non-idle exposure after user interaction', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Active reading should resume when keyboard input follows an idle visible documentation session.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000, idleTimeoutMs: 500 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

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
          kind: 'TextViewportExposureTick',
          value: expect.objectContaining({
            idleAgeMs: 400,
          }),
        }),
      ]),
    );

    controller.stop();
  });

  it('keeps final visibilitychange exposure active for the visible dwell window', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Visible reading before a tab is hidden should still count as active exposure time.');

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });

    try {
      await flushPromises();
      mocks.sendMessage.mockClear();

      const blockElement = document.querySelector('#guide');
      expect(blockElement).toBeInstanceOf(HTMLElement);
      emitFirstIntersection(blockElement as Element);

      await vi.advanceTimersByTimeAsync(500);
      setDocumentVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      const batch = mocks.sendMessage.mock.calls[0][0];
      expect(batch.payload.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'TextViewportExposureTick',
            value: expect.objectContaining({
              tickMs: 500,
              activeTab: true,
              documentVisible: true,
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
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Visible documentation should continue accumulating local reading exposure after returning to the tab.');

    const controller = startReadingCollector({ flushIntervalMs: 1_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

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
            kind: 'TextViewportExposureTick',
            value: expect.objectContaining({
              activeTab: true,
            }),
          }),
        ]),
      );
    expect(batch.payload.events.find((event: { kind: string }) => event.kind === 'TextViewportExposureTick')).not.toHaveProperty(
      'chunkId',
    );

    controller.stop();
  });

  it('flushes open exposure when the page is hidden by navigation before the next interval', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Navigation away from a technical article should preserve the final visible reading exposure locally.');

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

    await vi.advanceTimersByTimeAsync(500);
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    const batch = mocks.sendMessage.mock.calls[0][0];
    expect(batch.payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'TextViewportExposureTick',
          value: expect.objectContaining({
            tickMs: 500,
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
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Stopping a collector should still preserve final visible reading exposure when delivery briefly fails.');

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

    await vi.advanceTimersByTimeAsync(500);
    mocks.sendMessage.mockRejectedValueOnce(new Error('message port closed')).mockResolvedValueOnce({ ok: true });

    controller.stop();
    await vi.waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    });

    expect(mocks.sendMessage.mock.calls[1][0].payload.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'TextViewportExposureTick',
          value: expect.objectContaining({
            tickMs: 500,
          }),
        }),
      ]),
    );
  });

  it('orders final stop exposure before the page hidden event', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Stopping a visible reading session should keep exposure before the lifecycle hidden event.');

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

    await vi.advanceTimersByTimeAsync(500);
    controller.stop();
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    const eventKinds = mocks.sendMessage.mock.calls[0][0].payload.events.map((event: { kind: string }) => event.kind);
    expect(eventKinds).toEqual(['TextBlockVisible', 'TextViewportExposureTick', 'PageHidden']);
  });

  it('emits PageHidden when stopping a visible page collector', async () => {
    mocks.sendMessage.mockResolvedValue({ ok: true });

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
    mocks.sendMessage.mockResolvedValue({ ok: true });
    setGuideText('Repeated collector stops should not duplicate visible reading exposure after cleanup completes.');

    const controller = startReadingCollector({ flushIntervalMs: 10_000 });
    await flushPromises();
    mocks.sendMessage.mockClear();

    const blockElement = document.querySelector('#guide');
    expect(blockElement).toBeInstanceOf(HTMLElement);
    emitFirstIntersection(blockElement as Element);

    await vi.advanceTimersByTimeAsync(500);
    controller.stop();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    controller.stop();
    await flushPromises();

    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });
});
