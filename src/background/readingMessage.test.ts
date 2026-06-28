import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeEnglishText } from '../analysis/english';
import { createChunkId, createPageId, hashText } from '../domain/events';
import { MESSAGE_TYPES, type ReadingEventBatchPayload } from '../messaging/contracts';
import { handleReadingRuntimeMessage } from './readingMessage';

const pageUrl = 'https://docs.example.com/runtime-retry-loop';
const pageId = createPageId(pageUrl);
const chunkText = 'Runtime failures should remain visible to the content collector retry loop.';
const chunkAnalysis = analyzeEnglishText(chunkText);
const chunkId = createChunkId(pageId, chunkText);

const payload: ReadingEventBatchPayload = {
  page: {
    pageId,
    domain: 'docs.example.com',
    titleHash: 'title',
    urlHash: hashText(pageUrl),
    language: 'en',
    totalWords: chunkAnalysis.wordCount,
    capturedAt: Date.UTC(2026, 5, 27, 12, 0, 0),
  },
  chunks: [
    {
      chunkId,
      pageId,
      textHash: hashText(chunkText),
      text: chunkText,
      wordCount: chunkAnalysis.wordCount,
      sentenceCount: chunkAnalysis.sentenceCount,
      selector: 'p#guide',
    },
  ],
  events: [
    {
      id: 'event-1',
      sessionId: 'session-1',
      pageId,
      chunkId,
      kind: 'TextBlockExposureTick',
      occurredAt: Date.UTC(2026, 5, 27, 12, 0, 1),
      confidence: 'high',
      value: {
        dwellMs: 1_000,
        visibleRatio: 1,
        wordCount: chunkAnalysis.wordCount,
        activeTab: true,
        scrollSpeedWordsPerMinute: 180,
        idle: false,
      },
    },
  ],
};

describe('handleReadingRuntimeMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined for unrelated runtime messages', () => {
    const recordReadingEventBatch = vi.fn(async () => undefined);

    const result = handleReadingRuntimeMessage({ type: 'other.message' }, recordReadingEventBatch);

    expect(result).toBeUndefined();
    expect(recordReadingEventBatch).not.toHaveBeenCalled();
  });

  it('returns the storage write promise for reading event batches', async () => {
    const recordReadingEventBatch = vi.fn(async () => undefined);

    const result = handleReadingRuntimeMessage({ type: MESSAGE_TYPES.readingEventsBatch, payload }, recordReadingEventBatch);

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
    expect(recordReadingEventBatch).toHaveBeenCalledWith(payload);
  });

  it('rejects when local reading event storage fails', async () => {
    const failure = new Error('indexeddb unavailable');
    const recordReadingEventBatch = vi.fn(async () => {
      throw failure;
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = handleReadingRuntimeMessage({ type: MESSAGE_TYPES.readingEventsBatch, payload }, recordReadingEventBatch);

    await expect(result).rejects.toThrow('indexeddb unavailable');
    expect(console.error).toHaveBeenCalledWith('Failed to record Yuel reading batch', failure);
  });
});
