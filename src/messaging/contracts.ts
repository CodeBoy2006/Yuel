import type { PageSnapshot, ReadingConfidence, ReadingEvent, ReadingEventKind, TextChunkSnapshot } from '../domain/events';

export const MESSAGE_TYPES = {
  readingEventsBatch: 'yuel.readingEvents.batch',
} as const;

export interface ReadingEventBatchPayload {
  page: PageSnapshot;
  chunks: TextChunkSnapshot[];
  events: ReadingEvent[];
}

export interface ReadingEventBatchMessage {
  type: typeof MESSAGE_TYPES.readingEventsBatch;
  payload: ReadingEventBatchPayload;
}

export type YuelMessage = ReadingEventBatchMessage;

const READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'PageVisible',
  'PageHidden',
  'TextBlockVisible',
  'TextBlockHidden',
  'TextBlockExposureTick',
  'ScrollVelocityChanged',
  'UserIdle',
  'UserActive',
  'TextSelected',
  'LookupTriggered',
  'ChunkSaved',
  'PageExcluded',
]);
const READING_CONFIDENCES = new Set<ReadingConfidence>(['low', 'medium', 'high']);

export function isReadingEventBatchMessage(message: unknown): message is ReadingEventBatchMessage {
  return (
    isObject(message) &&
    message.type === MESSAGE_TYPES.readingEventsBatch &&
    isReadingEventBatchPayload(message.payload)
  );
}

function isReadingEventBatchPayload(payload: unknown): payload is ReadingEventBatchPayload {
  if (!isObject(payload)) {
    return false;
  }

  const { page, chunks, events } = payload;
  if (
    !isPageSnapshot(page) ||
    !Array.isArray(chunks) ||
    !chunks.every(isTextChunkSnapshot) ||
    !Array.isArray(events) ||
    !events.every(isReadingEvent)
  ) {
    return false;
  }

  return hasConsistentBatchLinks(page, chunks, events);
}

function hasConsistentBatchLinks(page: PageSnapshot, chunks: TextChunkSnapshot[], events: ReadingEvent[]): boolean {
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));

  return (
    chunks.every((chunk) => chunk.pageId === page.pageId) &&
    events.every((event) => event.pageId === page.pageId && (event.chunkId === undefined || chunkIds.has(event.chunkId)))
  );
}

function isPageSnapshot(value: unknown): value is PageSnapshot {
  return (
    isObject(value) &&
    isString(value.pageId) &&
    isString(value.domain) &&
    isString(value.titleHash) &&
    isString(value.urlHash) &&
    isString(value.language) &&
    isFiniteNumber(value.totalWords) &&
    isFiniteNumber(value.capturedAt)
  );
}

function isTextChunkSnapshot(value: unknown): value is TextChunkSnapshot {
  return (
    isObject(value) &&
    isString(value.chunkId) &&
    isString(value.pageId) &&
    isString(value.textHash) &&
    (value.text === undefined || isString(value.text)) &&
    isFiniteNumber(value.wordCount) &&
    isFiniteNumber(value.sentenceCount) &&
    isString(value.selector)
  );
}

function isReadingEvent(value: unknown): value is ReadingEvent {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.sessionId) &&
    isString(value.pageId) &&
    (value.chunkId === undefined || isString(value.chunkId)) &&
    isString(value.kind) &&
    READING_EVENT_KINDS.has(value.kind as ReadingEventKind) &&
    isFiniteNumber(value.occurredAt) &&
    isString(value.confidence) &&
    READING_CONFIDENCES.has(value.confidence as ReadingConfidence) &&
    (value.value === undefined || isObject(value.value))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
