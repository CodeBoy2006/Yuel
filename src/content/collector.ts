import {
  READING_VISIBILITY_THRESHOLD,
  startReadingSession,
  type ReadingSessionController,
  type ReadingSessionOptions,
} from '../analytics/readingSession';
import {
  getRectsVisibleRatio,
  measureViewportChunk,
  type RectBounds,
} from '../analytics/viewportGeometry';
import { createSessionId } from '../domain/events';
import { deliverReadingEventBatch } from '../messaging/readingEventsClient';
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

interface CollectorOptions extends ReadingSessionOptions {
  dynamicRefreshDebounceMs?: number;
  routeCheckIntervalMs?: number;
}

interface CollectorRunController {
  readonly collecting: boolean;
  stop: (options?: { emitPageHidden?: boolean }) => void;
}

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

  const blocks = collectTextBlocks();
  const page = summarizeCurrentPage(document, blocks);
  const chunks = blocks.map(
    ({ element: _element, chunkIndex: _chunkIndex, chunkCount: _chunkCount, textRange: _textRange, ...chunk }) => chunk,
  );
  const blocksByElement = groupBlocksByElement(blocks);
  const blocksByChunkId = new Map(blocks.map((block) => [block.chunkId, block]));
  let session: ReadingSessionController | undefined;

  const observer = new IntersectionObserver((entries) => {
    if (document.visibilityState === 'hidden' || !session) {
      return;
    }

    for (const entry of entries) {
      const entryBlocks = blocksByElement.get(entry.target);
      if (!entryBlocks || entryBlocks.length === 0) continue;

      const now = Date.now();
      const entryIsVisible =
        entry.isIntersecting && entry.intersectionRatio >= READING_VISIBILITY_THRESHOLD;
      session.setChunkVisibilities(entryBlocks.map((block) => {
        const visibleRatio = entryIsVisible ? getTextBlockVisibleRatio(block) : 0;
        const visible = visibleRatio >= READING_VISIBILITY_THRESHOLD;

        return {
          chunkId: block.chunkId,
          visible,
          visibleRatio: visible ? visibleRatio : entryIsVisible ? 0 : entry.intersectionRatio,
        };
      }), now);
    }
  }, { threshold: [READING_VISIBILITY_THRESHOLD, 0.35, 0.65, 0.9] });

  const onScroll = () => {
    session?.recordScroll();
  };

  const onSelectionChange = () => {
    session?.recordSelection(document.getSelection()?.toString() ?? '');
  };

  session = startReadingSession({
    page,
    chunks,
    deliverBatch: deliverReadingEventBatch,
    getChunkMeasurement: (chunkId) => {
      const block = blocksByChunkId.get(chunkId);
      if (!block) {
        return undefined;
      }

      const rects = getTextBlockClientRects(block);
      return measureViewportChunk(
        rects,
        getWindowViewportBounds(rects[0]),
        block.wordCount,
        getContentRateMultiplier(block.element),
      );
    },
    getRestorableChunkVisibilities: () => blocks.flatMap((block) => {
      const visibleRatio = getTextBlockVisibleRatio(block);
      return visibleRatio >= READING_VISIBILITY_THRESHOLD
        ? [{ chunkId: block.chunkId, visible: true, visibleRatio }]
        : [];
    }),
    getScrollMetrics: () => ({
      offsetPx: getCurrentScrollY(),
      scrollableExtentPx: Math.max(1, document.documentElement.scrollHeight - window.innerHeight),
    }),
    sessionId,
    flushIntervalMs: options.flushIntervalMs,
    idleTimeoutMs: options.idleTimeoutMs,
    sampleIntervalMs: options.sampleIntervalMs,
    scrollSpeedExpiryMs: options.scrollSpeedExpiryMs,
  });

  for (const element of blocksByElement.keys()) {
    observer.observe(element);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('selectionchange', onSelectionChange);

  return {
    get collecting() {
      return session?.collecting ?? false;
    },
    stop: ({ emitPageHidden = true }: { emitPageHidden?: boolean } = {}) => {
      if (!session?.collecting) {
        return;
      }

      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('selectionchange', onSelectionChange);
      observer.disconnect();
      session.stop({ emitPageHidden });
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

function getTextBlockVisibleRatio(block: TextBlockCandidate): number {
  const rects = getTextBlockClientRects(block);
  return getRectsVisibleRatio(rects, getWindowViewportBounds(rects[0]));
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

function hasRectArea(rect: DOMRect): boolean {
  return Math.max(0, rect.width) * Math.max(0, rect.height) > 0;
}

function getWindowViewportBounds(fallbackRect?: RectBounds): RectBounds {
  const width = window.innerWidth || document.documentElement.clientWidth || fallbackRect?.width || 1;
  const height = window.innerHeight || document.documentElement.clientHeight || fallbackRect?.height || 1;

  return {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
  };
}

function getContentRateMultiplier(element: HTMLElement): number {
  const tagName = element.tagName.toLowerCase();
  if (element.closest('pre, code')) return 0.2;
  if (tagName === 'li') return 0.8;
  if (/^h[1-6]$/.test(tagName)) return 0.6;
  return 1;
}

function getCurrentScrollY(): number {
  return Math.max(0, window.scrollY || window.pageYOffset || 0);
}
