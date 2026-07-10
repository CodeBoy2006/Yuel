import { analyzeEnglishText } from '../../../src/analysis/english';
import { createChunkId, createPageId, hashText } from '../../../src/domain/events';
import {
  MESSAGE_TYPES,
  type ReadingEventBatchMessage,
  type ReadingEventBatchPayload,
} from '../../../src/messaging/contracts';

export const RUNTIME_LOOP_DOMAIN = 'runtime-loop.example';

export function createRuntimeReadingBatchMessage(now = Date.now()): ReadingEventBatchMessage {
  return {
    type: MESSAGE_TYPES.readingEventsBatch,
    payload: createRuntimeReadingBatchPayload(now),
  };
}

function createRuntimeReadingBatchPayload(now: number): ReadingEventBatchPayload {
  const url = `https://${RUNTIME_LOOP_DOMAIN}/local-first-browser-reading`;
  const pageId = createPageId(url);
  const chunkText =
    'Architecture performance guides help local first browser extensions measure reading behavior and vocabulary exposure safely.';
  const chunkAnalysis = analyzeEnglishText(chunkText);
  const chunkId = createChunkId(pageId, chunkText);
  const sessionId = `session_browser_smoke_${now}`;

  return {
    page: {
      pageId,
      domain: RUNTIME_LOOP_DOMAIN,
      titleHash: hashText('Runtime reading loop'),
      urlHash: hashText(url),
      language: 'en',
      totalWords: chunkAnalysis.wordCount,
      capturedAt: now,
    },
    chunks: [
      {
        chunkId,
        pageId,
        textHash: hashText(chunkText),
        text: chunkText,
        wordCount: chunkAnalysis.wordCount,
        sentenceCount: chunkAnalysis.sentenceCount,
        selector: 'article > p:nth-of-type(1)',
      },
    ],
    events: [
      {
        id: `PageVisible_browser_smoke_visible_${now}`,
        sessionId,
        pageId,
        kind: 'PageVisible',
        occurredAt: now,
        confidence: 'medium',
      },
      {
        id: `TextBlockVisible_browser_smoke_text_visible_${now}`,
        sessionId,
        pageId,
        chunkId,
        kind: 'TextBlockVisible',
        occurredAt: now + 1,
        confidence: 'high',
        value: {
          visibleRatio: 1,
          wordCount: chunkAnalysis.wordCount,
        },
      },
      {
        id: `TextViewportExposureTick_browser_smoke_exposure_${now}`,
        sessionId,
        pageId,
        kind: 'TextViewportExposureTick',
        occurredAt: now + 60_000,
        confidence: 'high',
        value: {
          tickMs: 60_000,
          baseWordsPerMinute: 220,
          activeTab: true,
          documentVisible: true,
          scrollSpeedWordsPerMinute: 180,
          idleAgeMs: 0,
          visibleChunks: [
            {
              chunkId,
              wordCount: chunkAnalysis.wordCount,
              visibleRatio: 1,
              centerDistance: 0,
              contentWeight: 1,
            },
          ],
        },
      },
    ],
  };
}
