import { browser } from 'wxt/browser';

import { createEventId, createSessionId, hashText, type ReadingEvent, type TextChunkSnapshot } from '../domain/events';
import { MESSAGE_TYPES } from '../messaging/contracts';
import { collectTextBlocks, summarizeCurrentPage, type TextBlockCandidate } from './extractBlocks';

export interface CollectorController {
  stop: () => void;
}

interface CollectorOptions {
  flushIntervalMs?: number;
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
  const sessionId = createSessionId();
  const page = summarizeCurrentPage();
  const blocks = collectTextBlocks();
  const visibleBlocks = new Map<string, VisibleBlockState>();
  let latestScrollSpeedWordsPerMinute = 0;
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
        appendExposureTick(pendingEvents, sessionId, page.pageId, existingState, now, latestScrollSpeedWordsPerMinute);
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
    appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks, latestScrollSpeedWordsPerMinute);
    await flushEvents(page, blocks, pendingEvents);
  };

  const flushTimer = window.setInterval(() => {
    void flushNow();
  }, flushIntervalMs);

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks, latestScrollSpeedWordsPerMinute);
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

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('selectionchange', onSelectionChange);

  void flushNow();

  return {
    stop: () => {
      window.clearInterval(flushTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
): void {
  const now = Date.now();
  for (const state of visibleBlocks.values()) {
    appendExposureTick(pendingEvents, sessionId, pageId, state, now, scrollSpeedWordsPerMinute);
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
