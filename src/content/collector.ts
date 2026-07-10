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
  sampleIntervalMs?: number;
  scrollSpeedExpiryMs?: number;
}

interface CollectorRunController {
  readonly collecting: boolean;
  stop: (options?: { emitPageHidden?: boolean }) => void;
}

interface VisibleBlockState {
  block: TextBlockCandidate;
}

interface BlockVisibilityTransition {
  block: TextBlockCandidate;
  kind: 'TextBlockVisible' | 'TextBlockHidden';
  visibleRatio: number;
}

interface ScrollVelocitySample {
  scrollY: number;
  sampledAt: number;
}

interface ScrollVelocityMeasurement extends ScrollVelocitySample {
  scrollDeltaPx: number;
  scrollDirection: -1 | 1;
  elapsedMs: number;
  scrollSpeedWordsPerMinute: number;
}

type EmitReadingEvent = (
  id: ReadingEvent['id'],
  kind: ReadingEvent['kind'],
  occurredAt: ReadingEvent['occurredAt'],
  details: Omit<ReadingEvent, 'id' | 'sessionId' | 'pageId' | 'kind' | 'occurredAt'>,
) => void;

const VIEWPORT_ATTENTION_MEAN = 0.492;
const VIEWPORT_ATTENTION_STANDARD_DEVIATION = 0.201;

export function startReadingCollector(options: CollectorOptions = {}): CollectorController {
  if (getDocumentPrimaryLanguage(document) !== 'en') {
    return createNoopCollectorController();
  }

  const dynamicRefreshDebounceMs = options.dynamicRefreshDebounceMs ?? 1_000;
  const routeCheckIntervalMs = options.routeCheckIntervalMs ?? 1_000;
  let stopped = false;
  let currentHref = window.location.href;
  let currentSessionId = createSessionId();
  let currentRun = startReadingCollectorRun(options, currentSessionId);
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
    if (emitPageHidden) {
      currentSessionId = createSessionId();
    }
    currentRun = startReadingCollectorRun(options, currentSessionId);
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

function startReadingCollectorRun(
  options: CollectorOptions = {},
  sessionId = createSessionId(),
): CollectorRunController {
  if (getDocumentPrimaryLanguage(document) !== 'en') {
    return createNoopCollectorRunController();
  }

  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 45_000;
  const sampleIntervalMs = options.sampleIntervalMs ?? 1_000;
  const scrollSpeedExpiryMs = options.scrollSpeedExpiryMs ?? 750;
  const blocks = collectTextBlocks();
  const page = summarizeCurrentPage(document, blocks);
  const blocksByElement = groupBlocksByElement(blocks);
  const visibleBlocks = new Map<string, VisibleBlockState>();
  let latestScrollSpeedWordsPerMinute = 0;
  let latestScrollDirection: -1 | 0 | 1 = 0;
  let userIdle = false;
  let pageHidden = document.visibilityState === 'hidden';
  let windowFocused = !pageHidden && hasDocumentFocus();
  let stopped = false;
  let lastInteractionAt = Date.now();
  let lastViewportTickAt = Date.now();
  let idleStartedAt: number | undefined;
  let scrollSpeedExpiryTimer: number | undefined;
  let lastScrollSample: ScrollVelocitySample = {
    scrollY: getCurrentScrollY(),
    sampledAt: Date.now(),
  };
  const pendingEvents: ReadingEvent[] = [];
  const emitEvent: EmitReadingEvent = (id, kind, occurredAt, details) => {
    pendingEvents.push({
      id,
      sessionId,
      pageId: page.pageId,
      kind,
      occurredAt,
      ...details,
    });
  };
  if (!pageHidden) {
    emitEvent(createEventId('PageVisible'), 'PageVisible', Date.now(), { confidence: 'medium' });
  }

  const observer = new IntersectionObserver((entries) => {
    if (pageHidden) {
      return;
    }

    for (const entry of entries) {
      const entryBlocks = blocksByElement.get(entry.target);
      if (!entryBlocks || entryBlocks.length === 0) continue;

      const now = Date.now();
      const entryIsVisible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
      const blockVisibility = entryBlocks.map((block) => ({
        block,
        visibleRatio: entryIsVisible ? getTextBlockVisibleRatio(block) : 0,
      }));
      const transitions = [
        ...blockVisibility
          .filter(({ block, visibleRatio }) => visibleRatio >= 0.15 && !visibleBlocks.has(block.chunkId))
          .map<BlockVisibilityTransition>(({ block, visibleRatio }) => ({
            block, kind: 'TextBlockVisible', visibleRatio,
          })),
        ...blockVisibility
          .filter(({ block, visibleRatio }) => visibleRatio < 0.15 && visibleBlocks.has(block.chunkId))
          .map<BlockVisibilityTransition>(({ block }) => ({
            block, kind: 'TextBlockHidden',
            visibleRatio: entryIsVisible ? 0 : entry.intersectionRatio,
          })),
      ];
      if (transitions.length === 0) continue;

      closeCurrentViewportInterval(now);
      for (const transition of transitions) {
        if (transition.kind === 'TextBlockVisible') {
          visibleBlocks.set(transition.block.chunkId, { block: transition.block });
        } else {
          visibleBlocks.delete(transition.block.chunkId);
        }
        emitBlockVisibilityEvent(emitEvent, createEventId(transition.kind), transition, now);
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
    activeTab = document.visibilityState === 'visible' && windowFocused,
    documentVisible = document.visibilityState === 'visible',
  ) => {
    appendViewportExposureTick(
      emitEvent,
      visibleBlocks,
      lastViewportTickAt,
      now,
      latestScrollSpeedWordsPerMinute,
      latestScrollDirection,
      activeTab,
      documentVisible,
      now - lastInteractionAt,
    );
    lastViewportTickAt = now;
  };

  const flushTimer = window.setInterval(() => {
    void flushNow();
  }, flushIntervalMs);
  const sampleTimer = window.setInterval(() => {
    closeCurrentViewportInterval();
  }, sampleIntervalMs);

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

    closeCurrentViewportInterval(now);
    userIdle = true;
    idleStartedAt = now;
    emitEvent(createEventId('UserIdle', now), 'UserIdle', now, {
      confidence: 'medium',
      value: {
        idleMs: now - lastInteractionAt,
      },
    });
  };

  const markUserActive = (now = Date.now()) => {
    if (pageHidden) {
      return;
    }

    if (userIdle) {
      emitEvent(createEventId('UserActive', now), 'UserActive', now, {
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
    emitEvent(createEventId('PageHidden', now), 'PageHidden', now, { confidence: 'medium' });
    pageHidden = true;
  };

  const flushHiddenPage = () => {
    closeCurrentViewportInterval(Date.now(), windowFocused, true);
    if (scrollSpeedExpiryTimer !== undefined) {
      window.clearTimeout(scrollSpeedExpiryTimer);
      scrollSpeedExpiryTimer = undefined;
    }
    latestScrollSpeedWordsPerMinute = 0;
    latestScrollDirection = 0;
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
      windowFocused = hasDocumentFocus();
      const now = Date.now();
      lastInteractionAt = now;
      lastViewportTickAt = now;
      resetIdleTimer();
      emitEvent(createEventId('PageVisible', now), 'PageVisible', now, { confidence: 'medium' });
      restoreVisibleBlocksFromLayout(emitEvent, blocks, visibleBlocks);
    }
  };

  const onPageHide = () => {
    flushHiddenPage();
  };

  const scheduleScrollSpeedExpiry = () => {
    if (scrollSpeedExpiryTimer !== undefined) {
      window.clearTimeout(scrollSpeedExpiryTimer);
    }
    scrollSpeedExpiryTimer = window.setTimeout(() => {
      scrollSpeedExpiryTimer = undefined;
      if (!pageHidden && latestScrollSpeedWordsPerMinute > 0) {
        closeCurrentViewportInterval();
      }
      latestScrollSpeedWordsPerMinute = 0;
      latestScrollDirection = 0;
    }, scrollSpeedExpiryMs);
  };

  const onScroll = () => {
    if (pageHidden) {
      return;
    }

    const measurement = measureScrollVelocity(lastScrollSample, page.totalWords);
    if (!measurement) {
      markUserActive();
      return;
    }

    closeCurrentViewportInterval(measurement.sampledAt);
    markUserActive(measurement.sampledAt);
    lastScrollSample = {
      scrollY: measurement.scrollY,
      sampledAt: measurement.sampledAt,
    };
    latestScrollSpeedWordsPerMinute = measurement.scrollSpeedWordsPerMinute;
    latestScrollDirection = measurement.scrollDirection;
    scheduleScrollSpeedExpiry();
    emitEvent(createEventId('ScrollVelocityChanged', measurement.sampledAt), 'ScrollVelocityChanged', measurement.sampledAt, {
      confidence: confidenceFromScrollSpeed(measurement.scrollSpeedWordsPerMinute),
      value: {
        scrollDeltaPx: measurement.scrollDeltaPx,
        scrollDirection: measurement.scrollDirection,
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

    const now = Date.now();
    closeCurrentViewportInterval(now);
    markUserActive(now);
    emitEvent(createEventId('TextSelected', now), 'TextSelected', now, {
      confidence: 'high',
      value: {
        textHash: hashText(text),
        characterCount: text.length,
      },
    });
  };

  const onUserActivity = () => {
    const now = Date.now();
    closeCurrentViewportInterval(now);
    markUserActive(now);
  };

  const onWindowBlur = () => {
    if (!windowFocused) return;
    const now = Date.now();
    closeCurrentViewportInterval(now, true, document.visibilityState === 'visible');
    windowFocused = false;
  };

  const onWindowFocus = () => {
    if (windowFocused || pageHidden) return;
    const now = Date.now();
    closeCurrentViewportInterval(now, false, document.visibilityState === 'visible');
    windowFocused = true;
    markUserActive(now);
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
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
      window.clearInterval(sampleTimer);
      window.clearTimeout(idleTimer);
      if (scrollSpeedExpiryTimer !== undefined) {
        window.clearTimeout(scrollSpeedExpiryTimer);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
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

function emitBlockVisibilityEvent(
  emitEvent: EmitReadingEvent,
  id: ReadingEvent['id'],
  { block, kind, visibleRatio }: BlockVisibilityTransition,
  occurredAt: number,
): void {
  emitEvent(id, kind, occurredAt, {
    chunkId: block.chunkId,
    confidence: visibleRatio > 0.65 ? 'high' : 'medium',
    value: { visibleRatio, wordCount: block.wordCount },
  });
}

function restoreVisibleBlocksFromLayout(
  emitEvent: EmitReadingEvent,
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
    emitBlockVisibilityEvent(
      emitEvent,
      createEventId('TextBlockVisible', now),
      { block, kind: 'TextBlockVisible', visibleRatio },
      now,
    );
  }
}

function appendViewportExposureTick(
  emitEvent: EmitReadingEvent,
  visibleBlocks: Map<string, VisibleBlockState>,
  startedAt: number,
  now: number,
  scrollSpeedWordsPerMinute: number,
  scrollDirection: -1 | 0 | 1,
  activeTab: boolean,
  documentVisible: boolean,
  idleAgeMs: number,
): void {
  const tickMs = now - startedAt;
  if (tickMs < 250 || visibleBlocks.size === 0) {
    return;
  }

  const visibleChunks = Array.from(visibleBlocks.values()).flatMap((state) => {
    const rects = getTextBlockClientRects(state.block);
    const visibleRatio = getViewportRectsVisibleRatio(rects);
    if (visibleRatio < 0.15) {
      return [];
    }

    const contentMultiplier = getContentRateMultiplier(state.block.element);

    return [
      {
        chunkId: state.block.chunkId,
        wordCount: state.block.wordCount,
        visibleRatio,
        visibleWordCount: state.block.wordCount * visibleRatio,
        centerDistance: getViewportRectCenterDistance(getBoundingRect(rects)),
        viewportY: getViewportRectCenterY(getBoundingRect(rects)),
        attentionMass: getTextBlockAttentionMass(state.block, rects),
        contentMultiplier,
        // Kept during the v2 event migration so older background workers can
        // still validate and conservatively interpret a locally queued batch.
        contentWeight: contentMultiplier,
      },
    ];
  });

  if (visibleChunks.length === 0) {
    return;
  }

  emitEvent(createEventId('TextViewportExposureTick', now), 'TextViewportExposureTick', now, {
    confidence: visibleChunks.some((chunk) => chunk.visibleRatio > 0.65) ? 'high' : 'medium',
    value: {
      tickMs,
      baseWordsPerMinute: DEFAULT_BASE_WORDS_PER_MINUTE,
      activeTab,
      documentVisible,
      scrollSpeedWordsPerMinute,
      scrollDirection,
      idleAgeMs: Math.max(0, idleAgeMs),
      visibleChunks,
    },
  });
}

function getTextBlockVisibleRatio(block: TextBlockCandidate): number {
  return getViewportRectsVisibleRatio(getTextBlockClientRects(block));
}

function getTextBlockAttentionMass(block: TextBlockCandidate, rects = getTextBlockClientRects(block)): number {
  const totalArea = rects.reduce((sum, rect) => sum + getRectArea(rect), 0);
  if (totalArea <= 0) return 0;

  return rects.reduce((sum, rect) => {
    const visibleArea = getViewportVisibleArea(rect);
    if (visibleArea <= 0) return sum;

    const visibleWordMass = block.wordCount * visibleArea / totalArea;
    const viewportY = getVisibleRectCenterY(rect);
    const normalizedDistance = (viewportY - VIEWPORT_ATTENTION_MEAN) / VIEWPORT_ATTENTION_STANDARD_DEVIATION;
    const gaussianWeight = Math.exp(-0.5 * normalizedDistance * normalizedDistance);
    return sum + visibleWordMass * gaussianWeight;
  }, 0);
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

function getViewportRectCenterY(rect: DOMRect): number {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height || 1;
  return (rect.top + rect.height / 2) / Math.max(1, viewportHeight);
}

function getVisibleRectCenterY(rect: DOMRect): number {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height || 1;
  const visibleTop = Math.max(0, Math.min(viewportHeight, rect.top));
  const visibleBottom = Math.max(visibleTop, Math.min(viewportHeight, rect.bottom));
  return (visibleTop + visibleBottom) / 2 / Math.max(1, viewportHeight);
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

function getContentRateMultiplier(element: HTMLElement): number {
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
  const signedScrollDeltaPx = scrollY - previous.scrollY;
  const scrollDeltaPx = Math.abs(signedScrollDeltaPx);

  if (elapsedMs < 100 || scrollDeltaPx < 1) {
    return undefined;
  }

  const scrollableHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const pageProgressPerMinute = (scrollDeltaPx / scrollableHeight) * (60_000 / elapsedMs);

  return {
    scrollY,
    sampledAt,
    scrollDeltaPx,
    scrollDirection: signedScrollDeltaPx > 0 ? 1 : -1,
    elapsedMs,
    scrollSpeedWordsPerMinute: Math.round(Math.max(0, totalWords) * pageProgressPerMinute),
  };
}

function getCurrentScrollY(): number {
  return Math.max(0, window.scrollY || window.pageYOffset || 0);
}

function hasDocumentFocus(): boolean {
  return typeof document.hasFocus !== 'function' || document.hasFocus();
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
