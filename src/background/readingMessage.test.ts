import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_TYPES, type ReadingEventBatchPayload } from '../messaging/contracts';
import { handleReadingRuntimeMessage } from './readingMessage';

const payload: ReadingEventBatchPayload = {
  page: {
    pageId: 'page-1',
    domain: 'docs.example.com',
    titleHash: 'title',
    urlHash: 'url',
    language: 'en',
    totalWords: 12,
    capturedAt: Date.UTC(2026, 5, 27, 12, 0, 0),
  },
  chunks: [
    {
      chunkId: 'chunk-1',
      pageId: 'page-1',
      textHash: 'chunk-text',
      text: 'Runtime failures should remain visible to the content collector retry loop.',
      wordCount: 12,
      sentenceCount: 1,
      selector: 'p#guide',
    },
  ],
  events: [
    {
      id: 'event-1',
      sessionId: 'session-1',
      pageId: 'page-1',
      chunkId: 'chunk-1',
      kind: 'TextBlockExposureTick',
      occurredAt: Date.UTC(2026, 5, 27, 12, 0, 1),
      confidence: 'high',
      value: {
        dwellMs: 1_000,
        wordCount: 12,
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
