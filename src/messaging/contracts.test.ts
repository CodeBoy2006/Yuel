import { describe, expect, it } from 'vitest';

import { createChunkId, createPageId, hashText } from '../domain/events';
import {
  isReadingCollectorStatusRequest,
  isReadingCollectorStatusResponse,
  isReadingEventBatchMessage,
  MESSAGE_TYPES,
  type ReadingEventBatchMessage,
} from './contracts';

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

type ReadingEventBatchPayloadOverrides = Partial<
  Record<keyof ReadingEventBatchMessage['payload'], unknown>
>;

function createMessageWithPayload(overrides: ReadingEventBatchPayloadOverrides): unknown {
  return {
    ...validMessage,
    payload: {
      ...validMessage.payload,
      ...overrides,
    },
  };
}

function expectInvalidPayload(overrides: ReadingEventBatchPayloadOverrides): void {
  expect(isReadingEventBatchMessage(createMessageWithPayload(overrides))).toBe(false);
}

type ReadingEventOverrides = Partial<
  Record<keyof ReadingEventBatchMessage['payload']['events'][number], unknown>
>;

function createEvent(overrides: ReadingEventOverrides): unknown {
  return { ...validMessage.payload.events[0], ...overrides };
}

describe('reading collector status messages', () => {
  it('accepts only the dedicated status request and a complete response', () => {
    expect(isReadingCollectorStatusRequest({
      type: MESSAGE_TYPES.readingCollectorStatusRequest,
    })).toBe(true);
    expect(isReadingCollectorStatusRequest({
      type: MESSAGE_TYPES.readingCollectorStatusResponse,
    })).toBe(false);

    expect(isReadingCollectorStatusResponse({
      type: MESSAGE_TYPES.readingCollectorStatusResponse,
      url: validPageUrl,
      collecting: true,
    })).toBe(true);
    expect(isReadingCollectorStatusResponse({
      type: MESSAGE_TYPES.readingCollectorStatusResponse,
      url: validPageUrl,
      collecting: 'yes',
    })).toBe(false);
  });
});

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
    expectInvalidPayload({
      events: [],
    });
  });

  it('rejects batches containing malformed page, chunk, or event records', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        totalWords: '120',
      },
    });

    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], wordCount: Number.NaN }],
    });

    expectInvalidPayload({
      events: [createEvent({ kind: 'UnknownEvent' })],
    });
  });

  it('rejects batches containing negative page, chunk, or event numeric fields', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        totalWords: -1,
      },
    });

    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], sentenceCount: -1 }],
    });

    expectInvalidPayload({
      events: [createEvent({ occurredAt: -1 })],
    });
  });

  it('rejects page total words that differ from the chunk word count total', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        totalWords: validMessage.payload.chunks[0].wordCount + 1,
      },
    });
  });

  it('rejects page domains that do not match the page id prefix', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        domain: 'other.example.com',
      },
    });
  });

  it('rejects non-English page snapshots before local English analysis', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        language: 'fr',
      },
    });
  });

  it('rejects chunks below the collector word threshold', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        totalWords: 7,
      },
      chunks: [{ ...validMessage.payload.chunks[0], wordCount: 7 }],
      events: [
        createEvent({
          value: {
            dwellMs: 30_000,
            visibleRatio: 1,
            wordCount: 7,
            activeTab: true,
            scrollSpeedWordsPerMinute: 180,
            idle: false,
          },
        }),
      ],
    });
  });

  it('rejects chunks without positive sentence counts', () => {
    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], sentenceCount: 0 }],
    });
  });

  it('rejects chunk text that is blank or not trimmed', () => {
    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], text: '   ' }],
    });

    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], text: ' Mitigate memory overhead. ' }],
    });
  });

  it('rejects chunks without raw text needed for local vocabulary analysis', () => {
    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], text: undefined }],
    });
  });

  it('rejects chunk text whose hash does not match its text snapshot', () => {
    expectInvalidPayload({
      chunks: [
        {
          ...validMessage.payload.chunks[0],
          text: 'Architecture performance guides keep local extension telemetry private.',
        },
      ],
    });
  });

  it('rejects chunk text whose chunk id does not match its text snapshot', () => {
    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], chunkId: 'stale-chunk-id' }],
      events: [createEvent({ chunkId: 'stale-chunk-id' })],
    });
  });

  it('rejects chunk word counts that do not match the text snapshot analysis', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        totalWords: 9,
      },
      chunks: [{ ...validMessage.payload.chunks[0], wordCount: 9 }],
      events: [
        createEvent({
          value: {
            dwellMs: 30_000,
            visibleRatio: 1,
            wordCount: 9,
            activeTab: true,
            scrollSpeedWordsPerMinute: 180,
            idle: false,
          },
        }),
      ],
    });
  });

  it('rejects chunk sentence counts that do not match the text snapshot analysis', () => {
    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], sentenceCount: 2 }],
    });
  });

  it('rejects viewport exposure ticks without positive tick duration', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            tickMs: undefined,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            tickMs: 0,
          },
        }),
      ],
    });
  });

  it('rejects viewport exposure ticks without collector-shaped reading metadata', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            baseWordsPerMinute: undefined,
            activeTab: true,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            activeTab: 'yes',
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            scrollSpeedWordsPerMinute: -1,
          },
        }),
      ],
    });
  });

  it('rejects viewport exposure ticks below the collector visibility threshold', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            visibleChunks: [{ ...validVisibleChunk, visibleRatio: 0.14 }],
          },
        }),
      ],
    });
  });

  it('rejects visibility events without bounded visible ratios', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          kind: 'TextBlockVisible',
          value: {
            wordCount: 6,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          kind: 'TextBlockHidden',
          value: {
            visibleRatio: 1.2,
            wordCount: 6,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            dwellMs: 30_000,
            visibleRatio: -0.1,
          },
        }),
      ],
    });
  });

  it('rejects visibility events without positive word counts', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          kind: 'TextBlockVisible',
          value: {
            visibleRatio: 0.5,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          kind: 'TextBlockHidden',
          value: {
            visibleRatio: 0,
            wordCount: 0,
          },
        }),
      ],
    });
  });

  it('rejects visible block events below the collector visibility threshold', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          kind: 'TextBlockVisible',
          value: {
            visibleRatio: 0.14,
            wordCount: validMessage.payload.chunks[0].wordCount,
          },
        }),
      ],
    });
  });

  it('rejects hidden block events at or above the collector visibility threshold', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          kind: 'TextBlockHidden',
          value: {
            visibleRatio: 0.15,
            wordCount: validMessage.payload.chunks[0].wordCount,
          },
        }),
      ],
    });
  });

  it('rejects viewport visible chunk entries whose word counts differ from the linked chunk', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            visibleChunks: [{ ...validVisibleChunk, wordCount: validMessage.payload.chunks[0].wordCount + 1 }],
          },
        }),
      ],
    });
  });

  it('rejects selection telemetry without positive hashed metadata', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'TextSelected',
          value: {
            characterCount: 12,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'TextSelected',
          value: {
            textHash: 'selection-hash',
            characterCount: 0,
          },
        }),
      ],
    });
  });

  it('rejects raw text in selection telemetry', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'TextSelected',
          value: {
            text: 'private selected text',
            textHash: 'selection-hash',
            characterCount: 21,
          },
        }),
      ],
    });
  });

  it('rejects scroll velocity events without valid movement metadata', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'ScrollVelocityChanged',
          value: {
            scrollDeltaPx: 12,
            scrollSpeedWordsPerMinute: 240,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'ScrollVelocityChanged',
          value: {
            scrollDeltaPx: 0.5,
            elapsedMs: 100,
            scrollSpeedWordsPerMinute: 240,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'ScrollVelocityChanged',
          value: {
            scrollDeltaPx: 12,
            elapsedMs: 99,
            scrollSpeedWordsPerMinute: -1,
          },
        }),
      ],
    });
  });

  it('rejects activity events without nonnegative idle duration metadata', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'UserIdle',
          value: {},
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'UserActive',
          value: {
            idleMs: -1,
          },
        }),
      ],
    });
  });

  it('rejects page lifecycle events with unexpected payloads', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'PageVisible',
          value: {
            visible: true,
          },
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          chunkId: undefined,
          kind: 'PageHidden',
          value: {
            reason: 'visibilitychange',
          },
        }),
      ],
    });
  });

  it.each(['LookupTriggered', 'ChunkSaved', 'PageExcluded'])(
    'rejects unsupported raw event kind %s until a collector and contract exist',
    (kind) => {
      const rawMessage: unknown = createMessageWithPayload({
        events: [
          createEvent({
            chunkId: undefined,
            kind,
            value: undefined,
          }),
        ],
      });

      expect(isReadingEventBatchMessage(rawMessage)).toBe(false);
    },
  );

  it('rejects page-level events linked to chunks', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          kind: 'PageVisible',
          value: undefined,
        }),
      ],
    });
  });

  it('rejects blank required page, chunk, and event strings', () => {
    expectInvalidPayload({
      page: {
        ...validMessage.payload.page,
        domain: '   ',
      },
    });

    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], selector: '' }],
    });

    expectInvalidPayload({
      events: [createEvent({ id: '   ' })],
    });
  });

  it('rejects required strings with surrounding whitespace before they become local keys', () => {
    expectInvalidPayload({
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
        createEvent({
          pageId: ' page-1 ',
          chunkId: ' chunk-1 ',
        }),
      ],
    });
  });

  it('rejects chunks linked to a different page', () => {
    expectInvalidPayload({
      chunks: [{ ...validMessage.payload.chunks[0], pageId: 'page-2' }],
    });
  });

  it('rejects duplicate chunk IDs in a batch', () => {
    expectInvalidPayload({
      chunks: [
        validMessage.payload.chunks[0],
        {
          ...validMessage.payload.chunks[0],
          textHash: 'chunk-text-copy',
          text: 'A duplicate chunk identity would make local aggregate writes ambiguous.',
        },
      ],
    });
  });

  it('rejects duplicate event IDs in a batch', () => {
    expectInvalidPayload({
      events: [
        validMessage.payload.events[0],
        createEvent({
          chunkId: undefined,
          kind: 'PageVisible',
          value: undefined,
        }),
      ],
    });
  });

  it('rejects event IDs whose kind prefix does not match the event kind', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          id: 'PageVisible_event-1',
        }),
      ],
    });
  });

  it('rejects event IDs without a unique suffix after the kind prefix', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          id: 'TextViewportExposureTick_',
        }),
      ],
    });
  });

  it('rejects session IDs that do not match the collector session shape', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          sessionId: 'manual-session-1',
        }),
      ],
    });

    expectInvalidPayload({
      events: [
        createEvent({
          sessionId: 'session_',
        }),
      ],
    });
  });

  it('rejects batches whose events move backward in time', () => {
    expectInvalidPayload({
      events: [
        validMessage.payload.events[0],
        createEvent({
          id: 'TextViewportExposureTick_event-2',
          occurredAt: validMessage.payload.events[0].occurredAt - 1,
        }),
      ],
    });
  });

  it('rejects events that occurred before the page snapshot was captured', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          occurredAt: validMessage.payload.page.capturedAt - 1,
        }),
      ],
    });
  });

  it('rejects batches that mix reading session IDs', () => {
    expectInvalidPayload({
      events: [
        validMessage.payload.events[0],
        createEvent({
          id: 'TextViewportExposureTick_event-2',
          sessionId: 'session_2',
        }),
      ],
    });
  });

  it('rejects events linked to a different page', () => {
    expectInvalidPayload({
      events: [createEvent({ pageId: 'page-2' })],
    });
  });

  it('rejects chunk-scoped reading events without chunk links', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          id: 'TextBlockVisible_event-1',
          kind: 'TextBlockVisible',
          chunkId: undefined,
          value: {
            visibleRatio: 1,
            wordCount: validMessage.payload.chunks[0].wordCount,
          },
        }),
      ],
    });
  });

  it('rejects events linked to an unknown chunk', () => {
    expectInvalidPayload({
      events: [
        createEvent({
          value: {
            ...validViewportTickValue,
            visibleChunks: [{ ...validVisibleChunk, chunkId: 'chunk-2' }],
          },
        }),
      ],
    });
  });
});
