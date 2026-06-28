import { describe, expect, it } from 'vitest';

import { createChunkId, createPageId, hashText } from '../domain/events';
import { isReadingEventBatchMessage, MESSAGE_TYPES, type ReadingEventBatchMessage } from './contracts';

const validPageUrl = 'https://example.com/articles/local-reading';
const validPageId = createPageId(validPageUrl);
const validChunkText = 'Mitigate memory overhead and fail gracefully during rollout.';
const validChunkId = createChunkId(validPageId, validChunkText);
const validVisibleChunk = {
  chunkId: validChunkId,
  wordCount: 8,
  visibleRatio: 1,
  centerDistance: 0,
  contentWeight: 1,
};
const validViewportTickValue = {
  tickMs: 30_000,
  baseWordsPerMinute: 220,
  activeTab: true,
  documentVisible: true,
  scrollSpeedWordsPerMinute: 180,
  idleAgeMs: 0,
  visibleChunks: [validVisibleChunk],
};

const validMessage: ReadingEventBatchMessage = {
  type: MESSAGE_TYPES.readingEventsBatch,
  payload: {
    page: {
      pageId: validPageId,
      domain: 'example.com',
      titleHash: 'title',
      urlHash: hashText(validPageUrl),
      language: 'en',
      totalWords: 8,
      capturedAt: Date.UTC(2026, 5, 27, 12, 0, 0),
    },
    chunks: [
      {
        chunkId: validChunkId,
        pageId: validPageId,
        textHash: hashText(validChunkText),
        text: validChunkText,
        wordCount: 8,
        sentenceCount: 1,
        selector: 'p',
      },
    ],
    events: [
      {
        id: 'TextViewportExposureTick_event-1',
        sessionId: 'session_1',
        pageId: validPageId,
        kind: 'TextViewportExposureTick',
        occurredAt: Date.UTC(2026, 5, 27, 12, 0, 10),
        confidence: 'high',
        value: validViewportTickValue,
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

  it('rejects reading event batches without events', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [],
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

  it('rejects page total words that differ from the chunk word count total', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            totalWords: validMessage.payload.chunks[0].wordCount + 1,
          },
        },
      }),
    ).toBe(false);
  });

  it('rejects page domains that do not match the page id prefix', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            domain: 'other.example.com',
          },
        },
      }),
    ).toBe(false);
  });

  it('rejects non-English page snapshots before local English analysis', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            language: 'fr',
          },
        },
      }),
    ).toBe(false);
  });

  it('rejects chunks below the collector word threshold', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            totalWords: 7,
          },
          chunks: [{ ...validMessage.payload.chunks[0], wordCount: 7 }],
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                dwellMs: 30_000,
                visibleRatio: 1,
                wordCount: 7,
                activeTab: true,
                scrollSpeedWordsPerMinute: 180,
                idle: false,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunks without positive sentence counts', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], sentenceCount: 0 }],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunk text that is blank or not trimmed', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], text: '   ' }],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], text: ' Mitigate memory overhead. ' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunks without raw text needed for local vocabulary analysis', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], text: undefined }],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunk text whose hash does not match its text snapshot', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [
            {
              ...validMessage.payload.chunks[0],
              text: 'Architecture performance guides keep local extension telemetry private.',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunk text whose chunk id does not match its text snapshot', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], chunkId: 'stale-chunk-id' }],
          events: [{ ...validMessage.payload.events[0], chunkId: 'stale-chunk-id' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunk word counts that do not match the text snapshot analysis', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            totalWords: 9,
          },
          chunks: [{ ...validMessage.payload.chunks[0], wordCount: 9 }],
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                dwellMs: 30_000,
                visibleRatio: 1,
                wordCount: 9,
                activeTab: true,
                scrollSpeedWordsPerMinute: 180,
                idle: false,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects chunk sentence counts that do not match the text snapshot analysis', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [{ ...validMessage.payload.chunks[0], sentenceCount: 2 }],
        },
      }),
    ).toBe(false);
  });

  it('rejects viewport exposure ticks without positive tick duration', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                tickMs: undefined,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                tickMs: 0,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects viewport exposure ticks without collector-shaped reading metadata', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                baseWordsPerMinute: undefined,
                activeTab: true,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                activeTab: 'yes',
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                scrollSpeedWordsPerMinute: -1,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects viewport exposure ticks below the collector visibility threshold', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                visibleChunks: [{ ...validVisibleChunk, visibleRatio: 0.14 }],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects visibility events without bounded visible ratios', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'TextBlockVisible',
              value: {
                wordCount: 6,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'TextBlockHidden',
              value: {
                visibleRatio: 1.2,
                wordCount: 6,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                dwellMs: 30_000,
                visibleRatio: -0.1,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects visibility events without positive word counts', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'TextBlockVisible',
              value: {
                visibleRatio: 0.5,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'TextBlockHidden',
              value: {
                visibleRatio: 0,
                wordCount: 0,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects visible block events below the collector visibility threshold', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'TextBlockVisible',
              value: {
                visibleRatio: 0.14,
                wordCount: validMessage.payload.chunks[0].wordCount,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects hidden block events at or above the collector visibility threshold', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'TextBlockHidden',
              value: {
                visibleRatio: 0.15,
                wordCount: validMessage.payload.chunks[0].wordCount,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects viewport visible chunk entries whose word counts differ from the linked chunk', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                visibleChunks: [{ ...validVisibleChunk, wordCount: validMessage.payload.chunks[0].wordCount + 1 }],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects selection telemetry without positive hashed metadata', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'TextSelected',
              value: {
                characterCount: 12,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'TextSelected',
              value: {
                textHash: 'selection-hash',
                characterCount: 0,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects raw text in selection telemetry', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'TextSelected',
              value: {
                text: 'private selected text',
                textHash: 'selection-hash',
                characterCount: 21,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects scroll velocity events without valid movement metadata', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'ScrollVelocityChanged',
              value: {
                scrollDeltaPx: 12,
                scrollSpeedWordsPerMinute: 240,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'ScrollVelocityChanged',
              value: {
                scrollDeltaPx: 0.5,
                elapsedMs: 100,
                scrollSpeedWordsPerMinute: 240,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'ScrollVelocityChanged',
              value: {
                scrollDeltaPx: 12,
                elapsedMs: 99,
                scrollSpeedWordsPerMinute: -1,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects activity events without nonnegative idle duration metadata', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'UserIdle',
              value: {},
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'UserActive',
              value: {
                idleMs: -1,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects page lifecycle events with unexpected payloads', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'PageVisible',
              value: {
                visible: true,
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'PageHidden',
              value: {
                reason: 'visibilitychange',
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects unshaped future event payloads before they enter raw storage', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'LookupTriggered',
              value: {
                text: 'private lookup text',
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'PageExcluded',
              value: {
                url: 'https://example.com/private',
              },
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'ChunkSaved',
              value: {
                text: validMessage.payload.chunks[0].text,
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects unimplemented future event kinds until their collectors exist', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'LookupTriggered',
              value: undefined,
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'PageExcluded',
              value: undefined,
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'ChunkSaved',
              value: undefined,
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects page-level events linked to chunks', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              kind: 'PageVisible',
              value: undefined,
            },
          ],
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

  it('rejects required strings with surrounding whitespace before they become local keys', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          page: {
            ...validMessage.payload.page,
            pageId: ' page-1 ',
          },
          chunks: [
            {
              ...validMessage.payload.chunks[0],
              chunkId: ' chunk-1 ',
              pageId: ' page-1 ',
            },
          ],
          events: [
            {
              ...validMessage.payload.events[0],
              pageId: ' page-1 ',
              chunkId: ' chunk-1 ',
            },
          ],
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

  it('rejects duplicate chunk IDs in a batch', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          chunks: [
            validMessage.payload.chunks[0],
            {
              ...validMessage.payload.chunks[0],
              textHash: 'chunk-text-copy',
              text: 'A duplicate chunk identity would make local aggregate writes ambiguous.',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects duplicate event IDs in a batch', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            validMessage.payload.events[0],
            {
              ...validMessage.payload.events[0],
              chunkId: undefined,
              kind: 'PageVisible',
              value: undefined,
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects event IDs whose kind prefix does not match the event kind', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              id: 'PageVisible_event-1',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects event IDs without a unique suffix after the kind prefix', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              id: 'TextViewportExposureTick_',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects session IDs that do not match the collector session shape', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              sessionId: 'manual-session-1',
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              sessionId: 'session_',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects batches whose events move backward in time', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            validMessage.payload.events[0],
            {
              ...validMessage.payload.events[0],
              id: 'TextViewportExposureTick_event-2',
              occurredAt: validMessage.payload.events[0].occurredAt - 1,
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects events that occurred before the page snapshot was captured', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              occurredAt: validMessage.payload.page.capturedAt - 1,
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects batches that mix reading session IDs', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            validMessage.payload.events[0],
            {
              ...validMessage.payload.events[0],
              id: 'TextViewportExposureTick_event-2',
              sessionId: 'session_2',
            },
          ],
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

  it('rejects chunk-scoped reading events without chunk links', () => {
    expect(
      isReadingEventBatchMessage({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          events: [
            {
              ...validMessage.payload.events[0],
              id: 'TextBlockVisible_event-1',
              kind: 'TextBlockVisible',
              chunkId: undefined,
              value: {
                visibleRatio: 1,
                wordCount: validMessage.payload.chunks[0].wordCount,
              },
            },
          ],
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
          events: [
            {
              ...validMessage.payload.events[0],
              value: {
                ...validViewportTickValue,
                visibleChunks: [{ ...validVisibleChunk, chunkId: 'chunk-2' }],
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });
});
