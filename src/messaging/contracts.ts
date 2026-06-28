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
const CHUNK_SCOPED_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'TextBlockVisible',
  'TextBlockHidden',
  'TextBlockExposureTick',
  'ChunkSaved',
]);
const VISIBILITY_RATIO_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'TextBlockVisible',
  'TextBlockHidden',
  'TextBlockExposureTick',
]);

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
    events.every((event) => {
      if (event.pageId !== page.pageId) {
        return false;
      }

      if (CHUNK_SCOPED_READING_EVENT_KINDS.has(event.kind)) {
        return event.chunkId !== undefined && chunkIds.has(event.chunkId);
      }

      return event.chunkId === undefined || chunkIds.has(event.chunkId);
    })
  );
}

function isPageSnapshot(value: unknown): value is PageSnapshot {
  return (
    isObject(value) &&
    isNonBlankString(value.pageId) &&
    isNonBlankString(value.domain) &&
    isNonBlankString(value.titleHash) &&
    isNonBlankString(value.urlHash) &&
    isNonBlankString(value.language) &&
    isNonNegativeFiniteNumber(value.totalWords) &&
    isNonNegativeFiniteNumber(value.capturedAt)
  );
}

function isTextChunkSnapshot(value: unknown): value is TextChunkSnapshot {
  return (
    isObject(value) &&
    isNonBlankString(value.chunkId) &&
    isNonBlankString(value.pageId) &&
    isNonBlankString(value.textHash) &&
    (value.text === undefined || isString(value.text)) &&
    isNonNegativeFiniteNumber(value.wordCount) &&
    isNonNegativeFiniteNumber(value.sentenceCount) &&
    isNonBlankString(value.selector)
  );
}

function isReadingEvent(value: unknown): value is ReadingEvent {
  if (
    !(
      isObject(value) &&
      isNonBlankString(value.id) &&
      isNonBlankString(value.sessionId) &&
      isNonBlankString(value.pageId) &&
      (value.chunkId === undefined || isNonBlankString(value.chunkId)) &&
      isNonBlankString(value.kind) &&
      READING_EVENT_KINDS.has(value.kind as ReadingEventKind) &&
      isNonNegativeFiniteNumber(value.occurredAt) &&
      isNonBlankString(value.confidence) &&
      READING_CONFIDENCES.has(value.confidence as ReadingConfidence) &&
      (value.value === undefined || isObject(value.value))
    )
  ) {
    return false;
  }

  return hasValidReadingEventValue(value.kind as ReadingEventKind, value.value);
}

function hasValidReadingEventValue(kind: ReadingEventKind, value: unknown): boolean {
  if (kind === 'TextBlockExposureTick') {
    return isObject(value) && isPositiveFiniteNumber(value.dwellMs) && isUnitIntervalFiniteNumber(value.visibleRatio);
  }

  if (VISIBILITY_RATIO_READING_EVENT_KINDS.has(kind)) {
    return isObject(value) && isUnitIntervalFiniteNumber(value.visibleRatio);
  }

  if (kind === 'TextSelected') {
    return (
      isObject(value) &&
      isNonBlankString(value.textHash) &&
      isPositiveFiniteNumber(value.characterCount) &&
      value.text === undefined
    );
  }

  if (kind === 'ScrollVelocityChanged') {
    return (
      isObject(value) &&
      isFiniteNumberAtLeast(value.scrollDeltaPx, 1) &&
      isFiniteNumberAtLeast(value.elapsedMs, 100) &&
      isNonNegativeFiniteNumber(value.scrollSpeedWordsPerMinute)
    );
  }

  if (kind === 'UserIdle' || kind === 'UserActive') {
    return isObject(value) && isNonNegativeFiniteNumber(value.idleMs);
  }

  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonBlankString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0 && value.trim() === value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isUnitIntervalFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isFiniteNumberAtLeast(value: unknown, minimum: number): value is number {
  return isFiniteNumber(value) && value >= minimum;
}
