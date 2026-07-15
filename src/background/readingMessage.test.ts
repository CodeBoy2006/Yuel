import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeEnglishText } from '../analysis/english';
import {
  createChunkId,
  createPageId,
  createPageSnapshotId,
  hashText,
} from '../domain/events';
import { MESSAGE_TYPES, type ReadingEventBatchPayload } from '../messaging/contracts';
import { handleReadingRuntimeMessage, respondToReadingRuntimeMessage } from './readingMessage';
import { InMemoryReadingPageSnapshotRegistry } from './readingSnapshotRegistry';

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
      id: 'TextViewportExposureTick_event-1',
      sessionId: 'session_1',
      pageId,
      kind: 'TextViewportExposureTick',
      occurredAt: Date.UTC(2026, 5, 27, 12, 0, 1),
      confidence: 'high',
      value: {
        tickMs: 1_000,
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

describe('handleReadingRuntimeMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined for unrelated runtime messages', () => {
    const recordReadingEventBatch = vi.fn(async () => undefined);

    const result = handleReadingRuntimeMessage(
      { type: 'other.message' },
      undefined,
      { recordBatch: recordReadingEventBatch },
    );

    expect(result).toBeUndefined();
    expect(recordReadingEventBatch).not.toHaveBeenCalled();
  });

  it('returns the storage write promise for reading event batches', async () => {
    const recordReadingEventBatch = vi.fn(async () => undefined);
    const authorize = vi.fn(async () => true);
    const syncToolbarIcon = vi.fn(async () => undefined);

    const result = handleReadingRuntimeMessage(
      { type: MESSAGE_TYPES.readingEventsBatch, payload },
      { tab: { url: pageUrl } },
      { authorize, recordBatch: recordReadingEventBatch, syncToolbarIcon },
    );

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual({ ok: true });
    expect(recordReadingEventBatch).toHaveBeenCalledWith(payload);
    expect(syncToolbarIcon).toHaveBeenCalledOnce();
  });

  it('drops a valid batch when its sender is no longer authorized', async () => {
    const recordReadingEventBatch = vi.fn(async () => undefined);

    const result = handleReadingRuntimeMessage(
      { type: MESSAGE_TYPES.readingEventsBatch, payload },
      { tab: { url: pageUrl } },
      {
        authorize: async () => false,
        recordBatch: recordReadingEventBatch,
        syncToolbarIcon: async () => undefined,
      },
    );

    await expect(result).resolves.toEqual({ ok: true, accepted: false });
    expect(recordReadingEventBatch).not.toHaveBeenCalled();
  });

  it('reports failure when local reading event storage fails', async () => {
    const failure = new Error('indexeddb unavailable');
    const recordReadingEventBatch = vi.fn(async () => {
      throw failure;
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = handleReadingRuntimeMessage(
      { type: MESSAGE_TYPES.readingEventsBatch, payload },
      { tab: { url: pageUrl } },
      {
        authorize: async () => true,
        recordBatch: recordReadingEventBatch,
        syncToolbarIcon: async () => undefined,
      },
    );

    await expect(result).resolves.toEqual({ ok: false });
    expect(console.error).toHaveBeenCalledWith('Failed to record Yuel reading batch', failure);
  });

  it('uses the Chrome 116 sendResponse contract and keeps the message channel open', async () => {
    const write = createDeferred<void>();
    const sendResponse = vi.fn();

    const keepChannelOpen = respondToReadingRuntimeMessage(
      { type: MESSAGE_TYPES.readingEventsBatch, payload },
      { tab: { url: pageUrl } },
      sendResponse,
      {
        authorize: async () => true,
        recordBatch: () => write.promise,
        syncToolbarIcon: async () => undefined,
      },
    );

    expect(keepChannelOpen).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();
    write.resolve(undefined);
    await write.promise;
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });

  it('reports a failed background write so the content collector can retry', async () => {
    const failure = new Error('indexeddb unavailable');
    const sendResponse = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const keepChannelOpen = respondToReadingRuntimeMessage(
      { type: MESSAGE_TYPES.readingEventsBatch, payload },
      { tab: { url: pageUrl } },
      sendResponse,
      {
        authorize: async () => true,
        recordBatch: async () => {
          throw failure;
        },
        syncToolbarIcon: async () => undefined,
      },
    );

    expect(keepChannelOpen).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    });
  });

  it('keeps a stored reading batch successful when toolbar feedback fails', async () => {
    const failure = new Error('action unavailable');
    const recordBatch = vi.fn(async () => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = handleReadingRuntimeMessage(
      { type: MESSAGE_TYPES.readingEventsBatch, payload },
      { tab: { url: pageUrl } },
      {
        authorize: async () => true,
        recordBatch,
        syncToolbarIcon: async () => {
          throw failure;
        },
      },
    );

    await expect(result).resolves.toEqual({ ok: true });
    expect(recordBatch).toHaveBeenCalledWith(payload);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to refresh Yuel reading toolbar icon',
      failure,
    );
  });

  it('registers a web snapshot and resolves later event-only references', async () => {
    const snapshotRegistry = new InMemoryReadingPageSnapshotRegistry();
    const recordBatch = vi.fn(async () => undefined);
    const sender = { tab: { id: 7, url: pageUrl }, frameId: 0 };
    const snapshotId = createPageSnapshotId(payload.page, payload.chunks);
    const registration = {
      type: MESSAGE_TYPES.readingPageSnapshotRegister,
      payload: {
        snapshotId,
        ...payload,
      },
    };

    await expect(handleReadingRuntimeMessage(registration, sender, {
      authorize: async () => true,
      recordBatch,
      snapshotRegistry,
      syncToolbarIcon: async () => undefined,
    })).resolves.toEqual({
      ok: true,
      snapshotRegistered: true,
    });

    const referencedEvents = [{
      ...payload.events[0],
      id: 'TextViewportExposureTick_event-2',
      occurredAt: payload.events[0].occurredAt + 1_000,
    }];
    await expect(handleReadingRuntimeMessage({
      type: MESSAGE_TYPES.readingEventsReferenceBatch,
      payload: {
        snapshotId,
        events: referencedEvents,
      },
    }, sender, {
      authorize: async () => true,
      recordBatch,
      snapshotRegistry,
      syncToolbarIcon: async () => undefined,
    })).resolves.toEqual({ ok: true });

    expect(recordBatch).toHaveBeenNthCalledWith(1, payload);
    expect(recordBatch).toHaveBeenNthCalledWith(2, {
      page: payload.page,
      chunks: payload.chunks,
      events: referencedEvents,
    });
  });

  it('asks the content script to re-register after the snapshot cache is lost', async () => {
    const snapshotId = createPageSnapshotId(payload.page, payload.chunks);

    await expect(handleReadingRuntimeMessage({
      type: MESSAGE_TYPES.readingEventsReferenceBatch,
      payload: {
        snapshotId,
        events: payload.events,
      },
    }, { tab: { id: 7, url: pageUrl } }, {
      snapshotRegistry: new InMemoryReadingPageSnapshotRegistry(),
    })).resolves.toEqual({
      ok: false,
      reason: 'snapshot-missing',
    });
  });

  it('rejects references to chunks outside the registered snapshot', async () => {
    const snapshotRegistry = new InMemoryReadingPageSnapshotRegistry();
    const snapshotId = createPageSnapshotId(payload.page, payload.chunks);
    const sender = { tab: { id: 7, url: pageUrl } };
    const recordBatch = vi.fn(async () => undefined);
    snapshotRegistry.register(snapshotId, {
      page: payload.page,
      chunks: payload.chunks,
    }, sender);

    await expect(handleReadingRuntimeMessage({
      type: MESSAGE_TYPES.readingEventsReferenceBatch,
      payload: {
        snapshotId,
        events: [{
          ...payload.events[0],
          id: 'TextBlockVisible_unknown-chunk',
          kind: 'TextBlockVisible',
          chunkId: 'unknown-chunk',
          value: {
            visibleRatio: 1,
            wordCount: chunkAnalysis.wordCount,
          },
        }],
      },
    }, sender, {
      authorize: async () => true,
      recordBatch,
      snapshotRegistry,
      syncToolbarIcon: async () => undefined,
    })).resolves.toEqual({
      ok: false,
      reason: 'invalid-snapshot-reference',
    });
    expect(recordBatch).not.toHaveBeenCalled();
  });

  it('keeps an accepted snapshot registered when its first storage write fails', async () => {
    const failure = new Error('indexeddb unavailable');
    const snapshotRegistry = new InMemoryReadingPageSnapshotRegistry();
    const snapshotId = createPageSnapshotId(payload.page, payload.chunks);
    const sender = { tab: { id: 7, url: pageUrl } };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(handleReadingRuntimeMessage({
      type: MESSAGE_TYPES.readingPageSnapshotRegister,
      payload: {
        snapshotId,
        ...payload,
      },
    }, sender, {
      authorize: async () => true,
      recordBatch: async () => {
        throw failure;
      },
      snapshotRegistry,
      syncToolbarIcon: async () => undefined,
    })).resolves.toEqual({
      ok: false,
      snapshotRegistered: true,
    });

    expect(snapshotRegistry.resolve(snapshotId, sender)).toEqual({
      page: payload.page,
      chunks: payload.chunks,
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
