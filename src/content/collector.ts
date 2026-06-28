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
  stop: () => void;
}

interface CollectorOptions {
  flushIntervalMs?: number;
  idleTimeoutMs?: number;
}

interface VisibleBlockState {
  block: TextBlockCandidate;
  maxVisibleRatio: number;
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

  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 45_000;
  const sessionId = createSessionId();
  const blocks = collectTextBlocks();
  const page = summarizeCurrentPage(document, blocks);
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
      const block = blocks.find((candidate) => candidate.element === entry.target);
      if (!block) continue;

      const now = Date.now();
      const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
      const existingState = visibleBlocks.get(block.chunkId);

      if (isVisible) {
        const wasVisible = Boolean(existingState);
        if (!wasVisible) {
          closeCurrentViewportInterval(now);
        }
        visibleBlocks.set(block.chunkId, {
          block,
          maxVisibleRatio: Math.max(existingState?.maxVisibleRatio ?? 0, entry.intersectionRatio),
        });

        if (!wasVisible) {
          pendingEvents.push({
            id: createEventId('TextBlockVisible'),
            sessionId,
            pageId: page.pageId,
            chunkId: block.chunkId,
            kind: 'TextBlockVisible',
            occurredAt: now,
            confidence: entry.intersectionRatio > 0.65 ? 'high' : 'medium',
            value: {
              visibleRatio: entry.intersectionRatio,
              wordCount: block.wordCount,
            },
          });
        }
      } else if (existingState) {
        closeCurrentViewportInterval(now);
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
  }, { threshold: [0.15, 0.35, 0.65, 0.9] });

  for (const block of blocks) {
    observer.observe(block.element);
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
    stop: () => {
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
      appendPageHiddenOnce();
      void flushNow().then((delivered) => {
        if (!delivered && pendingEvents.length > 0) {
          void flushNow();
        }
      });
    },
  };
}

function createNoopCollectorController(): CollectorController {
  return {
    stop: () => undefined,
  };
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

    const visibleRatio = getViewportVisibleRatio(block.element);
    if (visibleRatio < 0.15) {
      continue;
    }

    visibleBlocks.set(block.chunkId, {
      block,
      maxVisibleRatio: visibleRatio,
    });
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

function getViewportVisibleRatio(element: Element): number {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return 0;
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height;
  const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));

  return (visibleWidth * visibleHeight) / (rect.width * rect.height);
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

  const visibleChunks = Array.from(visibleBlocks.values()).map((state) => ({
    chunkId: state.block.chunkId,
    wordCount: state.block.wordCount,
    visibleRatio: state.maxVisibleRatio,
    centerDistance: getViewportCenterDistance(state.block.element),
    contentWeight: getContentWeight(state.block.element),
  }));

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

function getViewportCenterDistance(element: Element): number {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height || 1;
  const elementCenterY = rect.top + rect.height / 2;
  const viewportCenterY = viewportHeight / 2;

  return Math.max(0, Math.abs(elementCenterY - viewportCenterY) / Math.max(1, viewportHeight));
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
  const chunks: TextChunkSnapshot[] = blocks.map(({ element: _element, ...chunk }) => chunk);

  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.readingEventsBatch,
      payload: { page, chunks, events },
    });
    return true;
  } catch (error) {
    pendingEvents.unshift(...events);
    console.warn('Failed to deliver Yuel reading events; will retry on the next flush', error);
    return false;
  }
}
