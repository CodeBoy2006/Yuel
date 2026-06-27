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

export function startReadingCollector(options: CollectorOptions = {}): CollectorController {
  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const sessionId = createSessionId();
  const page = summarizeCurrentPage();
  const blocks = collectTextBlocks();
  const visibleBlocks = new Map<string, VisibleBlockState>();
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
        appendExposureTick(pendingEvents, sessionId, page.pageId, existingState, now);
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
    appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks);
    await flushEvents(page, blocks, pendingEvents);
  };

  const flushTimer = window.setInterval(() => {
    void flushNow();
  }, flushIntervalMs);

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      appendOpenExposureTicks(pendingEvents, sessionId, page.pageId, visibleBlocks);
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
  document.addEventListener('selectionchange', onSelectionChange);

  void flushNow();

  return {
    stop: () => {
      window.clearInterval(flushTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
): void {
  const now = Date.now();
  for (const state of visibleBlocks.values()) {
    appendExposureTick(pendingEvents, sessionId, pageId, state, now);
    state.visibleSince = now;
  }
}

function appendExposureTick(
  pendingEvents: ReadingEvent[],
  sessionId: string,
  pageId: string,
  state: VisibleBlockState,
  now: number,
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
    },
  });
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

  await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.readingEventsBatch,
    payload: { page, chunks, events },
  });
}
