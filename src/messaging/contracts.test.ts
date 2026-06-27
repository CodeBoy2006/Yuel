import { describe, expect, it } from 'vitest';

import { isReadingEventBatchMessage, MESSAGE_TYPES, type ReadingEventBatchMessage } from './contracts';

const validMessage: ReadingEventBatchMessage = {
  type: MESSAGE_TYPES.readingEventsBatch,
  payload: {
    page: {
      pageId: 'page-1',
      domain: 'example.com',
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 120,
      capturedAt: Date.UTC(2026, 5, 27, 12, 0, 0),
    },
    chunks: [
      {
        chunkId: 'chunk-1',
        pageId: 'page-1',
        textHash: 'chunk-text',
        text: 'Mitigate memory overhead and fail gracefully.',
        wordCount: 6,
        sentenceCount: 1,
        selector: 'p',
      },
    ],
    events: [
      {
        id: 'event-1',
        sessionId: 'session-1',
        pageId: 'page-1',
        chunkId: 'chunk-1',
        kind: 'TextBlockExposureTick',
        occurredAt: Date.UTC(2026, 5, 27, 12, 0, 10),
        confidence: 'high',
        value: {
          dwellMs: 30_000,
          visibleRatio: 1,
        },
      },
    ],
  },
};

describe('isReadingEventBatchMessage', () => {
  it('accepts a structurally valid reading event batch message', () => {
    expect(isReadingEventBatchMessage(validMessage)).toBe(true);
  });

  it('rejects messages with the batch type but missing payload shape', () => {
    expect(isReadingEventBatchMessage({ type: MESSAGE_TYPES.readingEventsBatch, payload: {} })).toBe(false);
    expect(
      isReadingEventBatchMessage({
        type: MESSAGE_TYPES.readingEventsBatch,
        payload: {
          page: validMessage.payload.page,
          chunks: {},
          events: validMessage.payload.events,
        },
      }),
    ).toBe(false);
  });

  it('rejects batches containing malformed page, chunk, or event records', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            totalWords: '120',
          },
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], wordCount: Number.NaN }],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [{ ...validMessage.payload.events[0], kind: 'UnknownEvent' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects batches containing negative page, chunk, or event numeric fields', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            totalWords: -1,
          },
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], sentenceCount: -1 }],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [{ ...validMessage.payload.events[0], occurredAt: -1 }],
        },
      }),
    ).toBe(false);
  });

  it('rejects blank required page, chunk, and event strings', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            domain: '   ',
          },
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], selector: '' }],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [{ ...validMessage.payload.events[0], id: '   ' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunks linked to a different page', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], pageId: 'page-2' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects events linked to a different page', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [{ ...validMessage.payload.events[0], pageId: 'page-2' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects events linked to an unknown chunk', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [{ ...validMessage.payload.events[0], chunkId: 'chunk-2' }],
        },
      }),
    ).toBe(false);
  });
});
