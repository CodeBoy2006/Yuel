import { browser } from 'wxt/browser';

import { createEventId, createSessionId, hashText, type ReadingEvent, type TextChunkSnapshot } from '../domain/events';
import { DEFAULT_BASE_WORDS_PER_MINUTE } from '../domain/metrics';
import { MESSAGE_TYPES } from '../messaging/contracts';
import {
  collectTextBlocks,
  getDocumentPrimaryLanguage,
  summarizeCurrentPage,
  type TextBlockCandidate,
} from './extractBlocks';

export interface CollectorController {
  readonly collecting: boolean;
  stop: () => void;
}

interface CollectorOptions {
  dynamicRefreshDebounceMs?: number;
  flushIntervalMs?: number;
  idleTimeoutMs?: number;
  routeCheckIntervalMs?: number;
}

interface CollectorRunController {
  readonly collecting: boolean;
  stop: (options?: { emitPageHidden?: boolean }) => void;
}

interface VisibleBlockState {
  block: TextBlockCandidate;
}

interface ScrollVelocitySample {
  scrollY: number;
  sampledAt: number;
}

interface ScrollVelocityMeasurement extends ScrollVelocitySample {
  scrollDeltaPx: number;
  elapsedMs: number;
  scrollSpeedWordsPerMinute: number;
}

export function startReadingCollector(options: CollectorOptions = {}): CollectorController {
  if (getDocumentPrimaryLanguage(document) !== 'en') {
    return createNoopCollectorController();
  }

  const dynamicRefreshDebounceMs = options.dynamicRefreshDebounceMs ?? 1_000;
  const routeCheckIntervalMs = options.routeCheckIntervalMs ?? 1_000;
  let stopped = false;
  let currentHref = window.location.href;
  let currentRun = startReadingCollectorRun(options);
  let dynamicRefreshTimer: number | undefined;

  const restartRun = (emitPageHidden: boolean) => {
    if (stopped) {
      return;
    }

    if (dynamicRefreshTimer !== undefined) {
      window.clearTimeout(dynamicRefreshTimer);
      dynamicRefreshTimer = undefined;
    }

    currentRun.stop({ emitPageHidden });
    currentHref = window.location.href;
    currentRun = startReadingCollectorRun(options);
  };

  const restartForRouteIfNeeded = () => {
    if (window.location.href === currentHref) {
      return;
    }

    restartRun(true);
  };

  const scheduleContentRefresh = () => {
    if (stopped) {
      return;
    }

    if (window.location.href !== currentHref) {
      restartRun(true);
      return;
    }

    if (dynamicRefreshTimer !== undefined) {
      window.clearTimeout(dynamicRefreshTimer);
    }

    dynamicRefreshTimer = window.setTimeout(() => {
      dynamicRefreshTimer = undefined;
      if (window.location.href !== currentHref) {
        restartRun(true);
        return;
      }

      restartRun(false);
    }, dynamicRefreshDebounceMs);
  };

  const mutationObserver = createDynamicContentObserver(scheduleContentRefresh);
  const routeCheckTimer = window.setInterval(restartForRouteIfNeeded, routeCheckIntervalMs);

  window.addEventListener('popstate', restartForRouteIfNeeded);
  window.addEventListener('hashchange', restartForRouteIfNeeded);

  return {
    get collecting() {
      return !stopped && currentRun.collecting;
    },
    stop: () => {
      if (stopped) {
        return;
      }

      stopped = true;
      if (dynamicRefreshTimer !== undefined) {
        window.clearTimeout(dynamicRefreshTimer);
      }
      window.clearInterval(routeCheckTimer);
      window.removeEventListener('popstate', restartForRouteIfNeeded);
      window.removeEventListener('hashchange', restartForRouteIfNeeded);
      mutationObserver?.disconnect();
      currentRun.stop({ emitPageHidden: true });
    },
  };
}

function startReadingCollectorRun(options: CollectorOptions = {}): CollectorRunController {
  if (getDocumentPrimaryLanguage(document) !== 'en') {
    return createNoopCollectorRunController();
  }

  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 45_000;
  const sessionId = createSessionId();
  const blocks = collectTextBlocks();
  const page = summarizeCurrentPage(document, blocks);
  const blocksByElement = groupBlocksByElement(blocks);
  const visibleBlocks = new Map<string, VisibleBlockState>();
  let latestScrollSpeedWordsPerMinute = 0;
  let userIdle = false;
  let pageHidden = document.visibilityState === 'hidden';
  let stopped = false;
  let lastInteractionAt = Date.now();
  let lastViewportTickAt = Date.now();
  let idleStartedAt: number | undefined;
  let lastScrollSample: ScrollVelocitySample = {
    scrollY: getCurrentScrollY(),
    sampledAt: Date.now(),
  };
  const pendingEvents: ReadingEvent[] = pageHidden
    ? []
    : [
        {
          id: createEventId('PageVisible'),
          sessionId,
          pageId: page.pageId,
          kind: 'PageVisible',
          occurredAt: Date.now(),
          confidence: 'medium',
        },
      ];

  const observer = new IntersectionObserver((entries) => {
    if (pageHidden) {
      return;
    }

    for (const entry of entries) {
      const entryBlocks = blocksByElement.get(entry.target);
      if (!entryBlocks || entryBlocks.length === 0) continue;

      const now = Date.now();
      const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
      const visibleEntryBlocks = entryBlocks.filter((block) => visibleBlocks.has(block.chunkId));
      const blockVisibility = entryBlocks.map((block) => ({
        block,
        visibleRatio: isVisible ? getTextBlockVisibleRatio(block) : 0,
      }));

      if (isVisible) {
        const newlyVisibleBlocks = blockVisibility.filter(
          ({ block, visibleRatio }) => visibleRatio >= 0.15 && !visibleBlocks.has(block.chunkId),
        );
        const newlyHiddenBlocks = visibleEntryBlocks.filter((block) =>
          blockVisibility.some((visibility) => visibility.block.chunkId === block.chunkId && visibility.visibleRatio < 0.15),
        );
        if (newlyVisibleBlocks.length > 0 || newlyHiddenBlocks.length > 0) {
          closeCurrentViewportInterval(now);
        }

        for (const { block, visibleRatio } of newlyVisibleBlocks) {
          visibleBlocks.set(block.chunkId, { block });
          pendingEvents.push({
            id: createEventId('TextBlockVisible'),
            sessionId,
            pageId: page.pageId,
            chunkId: block.chunkId,
            kind: 'TextBlockVisible',
            occurredAt: now,
            confidence: visibleRatio > 0.65 ? 'high' : 'medium',
            value: {
              visibleRatio,
              wordCount: block.wordCount,
            },
          });
        }

        for (const block of newlyHiddenBlocks) {
          visibleBlocks.delete(block.chunkId);
          pendingEvents.push({
            id: createEventId('TextBlockHidden'),
            sessionId,
            pageId: page.pageId,
            chunkId: block.chunkId,
            kind: 'TextBlockHidden',
            occurredAt: now,
            confidence: 'medium',
            value: {
              visibleRatio: 0,
              wordCount: block.wordCount,
            },
          });
        }
      } else if (visibleEntryBlocks.length > 0) {
        closeCurrentViewportInterval(now);

        for (const block of visibleEntryBlocks) {
          visibleBlocks.delete(block.chunkId);
          pendingEvents.push({
            id: createEventId('TextBlockHidden'),
            sessionId,
            pageId: page.pageId,
            chunkId: block.chunkId,
            kind: 'TextBlockHidden',
            occurredAt: now,
            confidence: entry.intersectionRatio > 0.65 ? 'high' : 'medium',
            value: {
              visibleRatio: entry.intersectionRatio,
              wordCount: block.wordCount,
            },
          });
        }
      }
    }
  }, { threshold: [0.15, 0.35, 0.65, 0.9] });

  for (const element of blocksByElement.keys()) {
    observer.observe(element);
  }

  const flushNow = async (): Promise<boolean> => {
    closeCurrentViewportInterval();
    return flushEvents(page, blocks, pendingEvents);
  };

  const closeCurrentViewportInterval = (
    now = Date.now(),
    activeTab = document.visibilityState === 'visible',
    documentVisible = document.visibilityState === 'visible',
  ) => {
    appendViewportExposureTick(
      pendingEvents,
      sessionId,
      page.pageId,
      visibleBlocks,
      lastViewportTickAt,
      now,
      latestScrollSpeedWordsPerMinute,
      activeTab,
      documentVisible,
      now - lastInteractionAt,
    );
    lastViewportTickAt = now;
  };

  const flushTimer = window.setInterval(() => {
    void flushNow();
  }, flushIntervalMs);

  let idleTimer = window.setTimeout(() => {
    markUserIdle(Date.now());
  }, idleTimeoutMs);

  const resetIdleTimer = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      markUserIdle(Date.now());
    }, idleTimeoutMs);
  };

  const markUserIdle = (now: number) => {
    if (pageHidden || userIdle) {
      return;
    }

    userIdle = true;
    idleStartedAt = now;
    pendingEvents.push({
      id: createEventId('UserIdle', now),
      sessionId,
      pageId: page.pageId,
      kind: 'UserIdle',
      occurredAt: now,
      confidence: 'medium',
      value: {
        idleMs: now - lastInteractionAt,
      },
    });
  };

  const markUserActive = () => {
    if (pageHidden) {
      return;
    }

    const now = Date.now();
    if (userIdle) {
      pendingEvents.push({
        id: createEventId('UserActive', now),
        sessionId,
        pageId: page.pageId,
        kind: 'UserActive',
        occurredAt: now,
        confidence: 'medium',
        value: {
          idleMs: idleStartedAt ? now - idleStartedAt : 0,
        },
      });
    }

    userIdle = false;
    idleStartedAt = undefined;
    lastInteractionAt = now;
    resetIdleTimer();
  };

  const appendPageHiddenOnce = () => {
    if (pageHidden) {
      return;
    }

    const now = Date.now();
    pendingEvents.push({
      id: createEventId('PageHidden', now),
      sessionId,
      pageId: page.pageId,
      kind: 'PageHidden',
      occurredAt: now,
      confidence: 'medium',
    });
    pageHidden = true;
  };

  const flushHiddenPage = () => {
    closeCurrentViewportInterval(Date.now(), true, true);
    visibleBlocks.clear();
    appendPageHiddenOnce();

    void flushNow();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushHiddenPage();
      return;
    }

    if (pageHidden) {
      pageHidden = false;
      const now = Date.now();
      lastInteractionAt = now;
      lastViewportTickAt = now;
      resetIdleTimer();
      pendingEvents.push({
        id: createEventId('PageVisible', now),
        sessionId,
        pageId: page.pageId,
        kind: 'PageVisible',
        occurredAt: now,
        confidence: 'medium',
      });
      restoreVisibleBlocksFromLayout(pendingEvents, sessionId, page.pageId, blocks, visibleBlocks);
    }
  };

  const onPageHide = () => {
    flushHiddenPage();
  };

  const onScroll = () => {
    if (pageHidden) {
      return;
    }

    markUserActive();

    const measurement = measureScrollVelocity(lastScrollSample, page.totalWords);
    if (!measurement) {
      return;
    }

    lastScrollSample = {
      scrollY: measurement.scrollY,
      sampledAt: measurement.sampledAt,
    };
    latestScrollSpeedWordsPerMinute = measurement.scrollSpeedWordsPerMinute;
    pendingEvents.push({
      id: createEventId('ScrollVelocityChanged', measurement.sampledAt),
      sessionId,
      pageId: page.pageId,
      kind: 'ScrollVelocityChanged',
      occurredAt: measurement.sampledAt,
      confidence: confidenceFromScrollSpeed(measurement.scrollSpeedWordsPerMinute),
      value: {
        scrollDeltaPx: measurement.scrollDeltaPx,
        elapsedMs: measurement.elapsedMs,
        scrollSpeedWordsPerMinute: measurement.scrollSpeedWordsPerMinute,
      },
    });
  };

  const onSelectionChange = () => {
    if (pageHidden) {
      return;
    }

    const text = document.getSelection()?.toString().trim();
    if (!text) return;

    markUserActive();
    pendingEvents.push({
      id: createEventId('TextSelected'),
      sessionId,
      pageId: page.pageId,
      kind: 'TextSelected',
      occurredAt: Date.now(),
      confidence: 'high',
      value: {
        textHash: hashText(text),
        characterCount: text.length,
      },
    });
  };

  const onUserActivity = () => {
    markUserActive();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('pointerdown', onUserActivity);
  document.addEventListener('keydown', onUserActivity);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('selectionchange', onSelectionChange);

  void flushNow();

  return {
    get collecting() {
      return !stopped;
    },
    stop: ({ emitPageHidden = true }: { emitPageHidden?: boolean } = {}) => {
      if (stopped) {
        return;
      }

      stopped = true;
      window.clearInterval(flushTimer);
      window.clearTimeout(idleTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('pointerdown', onUserActivity);
      document.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('selectionchange', onSelectionChange);
      observer.disconnect();
      closeCurrentViewportInterval();
      visibleBlocks.clear();
      if (emitPageHidden) {
        appendPageHiddenOnce();
      }
      void flushNow().then((delivered) => {
        if (!delivered && pendingEvents.length > 0) {
          void flushNow();
        }
      });
    },
  };
}

function createDynamicContentObserver(onChanged: () => void): MutationObserver | undefined {
  if (typeof MutationObserver === 'undefined') {
    return undefined;
  }

  const target = document.body ?? document.documentElement;
  if (!target) {
    return undefined;
  }

  const observer = new MutationObserver((records) => {
    if (!records.some(isReadableContentMutation)) {
      return;
    }

    onChanged();
  });

  observer.observe(target, {
    childList: true,
    subtree: true,
  });

  return observer;
}

function isReadableContentMutation(record: MutationRecord): boolean {
  if (record.type !== 'childList') {
    return false;
  }

  return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(isPotentialReadableNode);
}

function isPotentialReadableNode(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.textContent?.trim());
  }

  if (!(node instanceof HTMLElement)) {
    return false;
  }

  if (node.matches('script, style, link, meta, noscript, svg, canvas')) {
    return false;
  }

  if (node.closest('script, style, noscript, svg, canvas')) {
    return false;
  }

  return Boolean(node.innerText || node.textContent?.trim());
}

function createNoopCollectorController(): CollectorController {
  return {
    collecting: false,
    stop: () => undefined,
  };
}

function createNoopCollectorRunController(): CollectorRunController {
  return {
    collecting: false,
    stop: () => undefined,
  };
}

function groupBlocksByElement(blocks: TextBlockCandidate[]): Map<Element, TextBlockCandidate[]> {
  const blocksByElement = new Map<Element, TextBlockCandidate[]>();

  for (const block of blocks) {
    const groupedBlocks = blocksByElement.get(block.element) ?? [];
    groupedBlocks.push(block);
    blocksByElement.set(block.element, groupedBlocks);
  }

  return blocksByElement;
}

function restoreVisibleBlocksFromLayout(
  pendingEvents: ReadingEvent[],
  sessionId: string,
  pageId: string,
  blocks: TextBlockCandidate[],
  visibleBlocks: Map<string, VisibleBlockState>,
): void {
  const now = Date.now();
  for (const block of blocks) {
    if (visibleBlocks.has(block.chunkId)) {
      continue;
    }

    const visibleRatio = getTextBlockVisibleRatio(block);
    if (visibleRatio < 0.15) {
      continue;
    }

    visibleBlocks.set(block.chunkId, { block });
    pendingEvents.push({
      id: createEventId('TextBlockVisible', now),
      sessionId,
      pageId,
      chunkId: block.chunkId,
      kind: 'TextBlockVisible',
      occurredAt: now,
      confidence: visibleRatio > 0.65 ? 'high' : 'medium',
      value: {
        visibleRatio,
        wordCount: block.wordCount,
      },
    });
  }
}

function appendViewportExposureTick(
  pendingEvents: ReadingEvent[],
  sessionId: string,
  pageId: string,
  visibleBlocks: Map<string, VisibleBlockState>,
  startedAt: number,
  now: number,
  scrollSpeedWordsPerMinute: number,
  activeTab: boolean,
  documentVisible: boolean,
  idleAgeMs: number,
): void {
  const tickMs = now - startedAt;
  if (tickMs < 250 || visibleBlocks.size === 0) {
    return;
  }

  const visibleChunks = Array.from(visibleBlocks.values()).flatMap((state) => {
    const visibleRatio = getTextBlockVisibleRatio(state.block);
    if (visibleRatio < 0.15) {
      return [];
    }

    return [
      {
        chunkId: state.block.chunkId,
        wordCount: state.block.wordCount,
        visibleRatio,
        centerDistance: getTextBlockCenterDistance(state.block),
        contentWeight: getContentWeight(state.block.element),
      },
    ];
  });

  if (visibleChunks.length === 0) {
    return;
  }

  pendingEvents.push({
    id: createEventId('TextViewportExposureTick', now),
    sessionId,
    pageId,
    kind: 'TextViewportExposureTick',
    occurredAt: now,
    confidence: visibleChunks.some((chunk) => chunk.visibleRatio > 0.65) ? 'high' : 'medium',
    value: {
      tickMs,
      baseWordsPerMinute: DEFAULT_BASE_WORDS_PER_MINUTE,
      activeTab,
      documentVisible,
      scrollSpeedWordsPerMinute,
      idleAgeMs: Math.max(0, idleAgeMs),
      visibleChunks,
    },
  });
}

function getTextBlockVisibleRatio(block: TextBlockCandidate): number {
  return getViewportRectsVisibleRatio(getTextBlockClientRects(block));
}

function getTextBlockCenterDistance(block: TextBlockCandidate): number {
  return getViewportRectCenterDistance(getBoundingRect(getTextBlockClientRects(block)));
}

function getTextBlockClientRects(block: TextBlockCandidate): DOMRect[] {
  const rangeRects = getRangeClientRects(block.textRange);
  if (rangeRects.length > 0) {
    return rangeRects;
  }

  return [getFallbackTextBlockViewportRect(block)];
}

function getRangeClientRects(range: Range | undefined): DOMRect[] {
  if (!range) {
    return [];
  }

  try {
    return Array.from(range.getClientRects()).filter(hasRectArea);
  } catch {
    return [];
  }
}

function getFallbackTextBlockViewportRect(block: TextBlockCandidate): DOMRect {
  const rect = block.element.getBoundingClientRect();
  if (block.chunkCount <= 1 || block.chunkIndex < 0 || rect.height <= 0) {
    return rect;
  }

  const boundedChunkCount = Math.max(1, block.chunkCount);
  const boundedChunkIndex = Math.min(boundedChunkCount - 1, block.chunkIndex);
  const chunkHeight = rect.height / boundedChunkCount;
  const top = rect.top + chunkHeight * boundedChunkIndex;
  const bottom = boundedChunkIndex === boundedChunkCount - 1 ? rect.bottom : top + chunkHeight;

  return {
    x: rect.x,
    y: top,
    width: rect.width,
    height: Math.max(0, bottom - top),
    top,
    right: rect.right,
    bottom,
    left: rect.left,
    toJSON: () => ({}),
  } as DOMRect;
}

function getViewportRectsVisibleRatio(rects: DOMRect[]): number {
  const totalArea = rects.reduce((sum, rect) => sum + getRectArea(rect), 0);
  if (totalArea <= 0) {
    return 0;
  }

  const visibleArea = rects.reduce((sum, rect) => sum + getViewportVisibleArea(rect), 0);
  return visibleArea / totalArea;
}

function getBoundingRect(rects: DOMRect[]): DOMRect {
  const [firstRect] = rects;
  if (!firstRect) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    top,
    right,
    bottom,
    left,
    toJSON: () => ({}),
  } as DOMRect;
}

function getViewportRectCenterDistance(rect: DOMRect): number {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height || 1;
  const elementCenterY = rect.top + rect.height / 2;
  const viewportCenterY = viewportHeight / 2;

  return Math.max(0, Math.abs(elementCenterY - viewportCenterY) / Math.max(1, viewportHeight));
}

function hasRectArea(rect: DOMRect): boolean {
  return getRectArea(rect) > 0;
}

function getRectArea(rect: DOMRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getViewportVisibleArea(rect: DOMRect): number {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height;
  const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));

  return visibleWidth * visibleHeight;
}

function getContentWeight(element: HTMLElement): number {
  const tagName = element.tagName.toLowerCase();
  if (element.closest('pre, code')) return 0.2;
  if (tagName === 'li') return 0.8;
  if (/^h[1-6]$/.test(tagName)) return 0.6;
  return 1;
}

function measureScrollVelocity(previous: ScrollVelocitySample, totalWords: number): ScrollVelocityMeasurement | undefined {
  const sampledAt = Date.now();
  const scrollY = getCurrentScrollY();
  const elapsedMs = sampledAt - previous.sampledAt;
  const scrollDeltaPx = Math.abs(scrollY - previous.scrollY);

  if (elapsedMs < 100 || scrollDeltaPx < 1) {
    return undefined;
  }

  const scrollableHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const pageProgressPerMinute = (scrollDeltaPx / scrollableHeight) * (60_000 / elapsedMs);

  return {
    scrollY,
    sampledAt,
    scrollDeltaPx,
    elapsedMs,
    scrollSpeedWordsPerMinute: Math.round(Math.max(0, totalWords) * pageProgressPerMinute),
  };
}

function getCurrentScrollY(): number {
  return Math.max(0, window.scrollY || window.pageYOffset || 0);
}

function confidenceFromScrollSpeed(scrollSpeedWordsPerMinute: number): ReadingEvent['confidence'] {
  if (scrollSpeedWordsPerMinute <= 400) {
    return 'high';
  }
  if (scrollSpeedWordsPerMinute <= 1_200) {
    return 'medium';
  }
  return 'low';
}

async function flushEvents(
  page: ReturnType<typeof summarizeCurrentPage>,
  blocks: TextBlockCandidate[],
  pendingEvents: ReadingEvent[],
): Promise<boolean> {
  if (pendingEvents.length === 0) {
    return true;
  }

  const events = pendingEvents.splice(0, pendingEvents.length);
  const chunks: TextChunkSnapshot[] = blocks.map(
    ({ element: _element, chunkIndex: _chunkIndex, chunkCount: _chunkCount, textRange: _textRange, ...chunk }) => chunk,
  );

  try {
    const response = await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.readingEventsBatch,
      payload: { page, chunks, events },
    });
    if (!isSuccessfulReadingMessageResponse(response)) {
      throw new Error('Yuel background rejected the reading event batch');
    }
    return true;
  } catch (error) {
    pendingEvents.unshift(...events);
    console.warn('Failed to deliver Yuel reading events; will retry on the next flush', error);
    return false;
  }
}

function isSuccessfulReadingMessageResponse(value: unknown): value is { ok: true } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === true;
}
