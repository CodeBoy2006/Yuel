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

export function startReadingCollector(options: CollectorOptions = {}): CollectorController {
  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const sessionId = createSessionId();
  const page = summarizeCurrentPage();
  const blocks = collectTextBlocks();
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

      pendingEvents.push({
        id: createEventId(entry.isIntersecting ? 'TextBlockVisible' : 'TextBlockHidden'),
        sessionId,
        pageId: page.pageId,
        chunkId: block.chunkId,
        kind: entry.isIntersecting ? 'TextBlockVisible' : 'TextBlockHidden',
        occurredAt: Date.now(),
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

  const flushTimer = window.setInterval(() => {
    void flushEvents(page, blocks, pendingEvents);
  }, flushIntervalMs);

  const onVisibilityChange = () => {
    pendingEvents.push({
      id: createEventId(document.visibilityState === 'hidden' ? 'PageHidden' : 'PageVisible'),
      sessionId,
      pageId: page.pageId,
      kind: document.visibilityState === 'hidden' ? 'PageHidden' : 'PageVisible',
      occurredAt: Date.now(),
      confidence: 'medium',
    });

    if (document.visibilityState === 'hidden') {
      void flushEvents(page, blocks, pendingEvents);
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

  void flushEvents(page, blocks, pendingEvents);

  return {
    stop: () => {
      window.clearInterval(flushTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('selectionchange', onSelectionChange);
      observer.disconnect();
      void flushEvents(page, blocks, pendingEvents);
    },
  };
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
