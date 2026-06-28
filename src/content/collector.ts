import { browser } from 'wxt/browser';

import { createEventId, createSessionId, hashText, type ReadingEvent, type TextChunkSnapshot } from '../domain/events';
import { MESSAGE_TYPES } from '../messaging/contracts';
import { collectTextBlocks, summarizeCurrentPage, type TextBlockCandidate } from './extractBlocks';

export interface CollectorController {
  stop: () => void;
}

interface CollectorOptions {
  flushIntervalMs?: number;
  idleTimeoutMs?: number;
}

interface VisibleBlockState {
  block: TextBlockCandidate;
  visibleSince: number;
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
  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 45_000;
  const sessionId = createSessionId();
  const page = summarizeCurrentPage();
  const blocks = collectTextBlocks();
  const visibleBlocks = new Map<string, VisibleBlockState>();
  let latestScrollSpeedWordsPerMinute = 0;
  let userIdle = false;
  let pageHidden = document.visibilityState === 'hidden';
  let stopped = false;
  let lastInteractionAt = Date.now();
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
        visibleBlocks.set(block.chunkId, {
          block,
          visibleSince: existingState?.visibleSince ?? now,
          maxVisibleRatio: Math.max(existingState?.maxVisibleRatio ?? 0, entry.intersectionRatio),
        });
      } else if (existingState) {
        appendExposureTick(
          pendingEvents,
          sessionId,
          page.pageId,
          existingState,
          now,
          latestScrollSpeedWordsPerMinute,
          userIdle,
          document.visibilityState === 'visible',
        );
        visibleBlocks.delete(block.chunkId);
      }

      pendingEvents.push({
        id: createEventId(isVisible ? 'TextBlockVisible' : 'TextBlockHidden'),
        sessionId,
        pageId: page.pageId,
        chunkId: block.chunkId,
        kind: isVisible ? 'TextBlockVisible' : 'TextBlockHidden',
        occurredAt: now,
        confidence: entry.intersectionRatio > 0.65 ? 'high' : 'medium',
        value: {
          visibleRatio: entry.intersectionRatio,
          wordCount: block.wordCount,
        },
      });
    }
  }, { threshold: [0.15, 0.35, 0.65, 0.9] });

  for (const block of blocks) {
    observer.observe(block.element);
  }

  const flushNow = async (): Promise<boolean> => {
    appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks, latestScrollSpeedWordsPerMinute, userIdle);
    return flushEvents(page, blocks, pendingEvents);
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
    appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks, latestScrollSpeedWordsPerMinute, userIdle, true);
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
      lastInteractionAt = Date.now();
      resetIdleTimer();
      restoreVisibleBlocksFromLayout(pendingEvents, sessionId, page.pageId, blocks, visibleBlocks);
      pendingEvents.push({
        id: createEventId('PageVisible'),
        sessionId,
        pageId: page.pageId,
        kind: 'PageVisible',
        occurredAt: Date.now(),
        confidence: 'medium',
      });
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
      appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks, latestScrollSpeedWordsPerMinute, userIdle);
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
      visibleSince: now,
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

function appendOpenExposureTicks(
  pendingEvents: ReadingEvent[],
  sessionId: string,
  pageId: string,
  visibleBlocks: Map<string, VisibleBlockState>,
  scrollSpeedWordsPerMinute: number,
  idle: boolean,
  activeTab = document.visibilityState === 'visible',
): void {
  const now = Date.now();
  for (const state of visibleBlocks.values()) {
    appendExposureTick(pendingEvents, sessionId, pageId, state, now, scrollSpeedWordsPerMinute, idle, activeTab);
    state.visibleSince = now;
  }
}

function appendExposureTick(
  pendingEvents: ReadingEvent[],
  sessionId: string,
  pageId: string,
  state: VisibleBlockState,
  now: number,
  scrollSpeedWordsPerMinute: number,
  idle: boolean,
  activeTab: boolean,
): void {
  const dwellMs = now - state.visibleSince;
  if (dwellMs < 250) {
    return;
  }

  pendingEvents.push({
    id: createEventId('TextBlockExposureTick', now),
    sessionId,
    pageId,
    chunkId: state.block.chunkId,
    kind: 'TextBlockExposureTick',
    occurredAt: now,
    confidence: state.maxVisibleRatio > 0.65 ? 'high' : 'medium',
    value: {
      dwellMs,
      visibleRatio: state.maxVisibleRatio,
      wordCount: state.block.wordCount,
      activeTab,
      scrollSpeedWordsPerMinute,
      idle,
    },
  });
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
