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
  let lastInteractionAt = Date.now();
  let idleStartedAt: number | undefined;
  let lastScrollSample: ScrollVelocitySample = {
    scrollY: getCurrentScrollY(),
    sampledAt: Date.now(),
  };
  const pendingEvents: ReadingEvent[] = [
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
        appendExposureTick(pendingEvents, sessionId, page.pageId, existingState, now, latestScrollSpeedWordsPerMinute, userIdle);
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

  const flushNow = async () => {
    appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks, latestScrollSpeedWordsPerMinute, userIdle);
    await flushEvents(page, blocks, pendingEvents);
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
    if (userIdle) {
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

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks, latestScrollSpeedWordsPerMinute, userIdle);
      visibleBlocks.clear();
    }

    pendingEvents.push({
      id: createEventId(document.visibilityState === 'hidden' ? 'PageHidden' : 'PageVisible'),
      sessionId,
      pageId: page.pageId,
      kind: document.visibilityState === 'hidden' ? 'PageHidden' : 'PageVisible',
      occurredAt: Date.now(),
      confidence: 'medium',
    });

    if (document.visibilityState === 'hidden') {
      void flushNow();
    }
  };

  const onScroll = () => {
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
  document.addEventListener('pointerdown', onUserActivity);
  document.addEventListener('keydown', onUserActivity);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('selectionchange', onSelectionChange);

  void flushNow();

  return {
    stop: () => {
      window.clearInterval(flushTimer);
      window.clearTimeout(idleTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointerdown', onUserActivity);
      document.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('selectionchange', onSelectionChange);
      observer.disconnect();
      void flushNow();
    },
  };
}

function appendOpenExposureTicks(
  pendingEvents: ReadingEvent[],
  sessionId: string,
  pageId: string,
  visibleBlocks: Map<string, VisibleBlockState>,
  scrollSpeedWordsPerMinute: number,
  idle: boolean,
): void {
  const now = Date.now();
  for (const state of visibleBlocks.values()) {
    appendExposureTick(pendingEvents, sessionId, pageId, state, now, scrollSpeedWordsPerMinute, idle);
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
      activeTab: document.visibilityState === 'visible',
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
): Promise<void> {
  if (pendingEvents.length === 0) {
    return;
  }

  const events = pendingEvents.splice(0, pendingEvents.length);
  const chunks: TextChunkSnapshot[] = blocks.map(({ element: _element, ...chunk }) => chunk);

  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.readingEventsBatch,
      payload: { page, chunks, events },
    });
  } catch (error) {
    pendingEvents.unshift(...events);
    console.warn('Failed to deliver Yuel reading events; will retry on the next flush', error);
  }
}
