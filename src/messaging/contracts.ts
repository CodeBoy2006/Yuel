import { analyzeEnglishText } from '../analysis/english';
import {
  createChunkId,
  hashText,
  type PageSnapshot,
  type ReadingConfidence,
  type ReadingEvent,
  type ReadingEventKind,
  type TextChunkSnapshot,
} from '../domain/events';

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

const SUPPORTED_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'PageVisible',
  'PageHidden',
  'TextBlockVisible',
  'TextBlockHidden',
  'TextBlockExposureTick',
  'ScrollVelocityChanged',
  'UserIdle',
  'UserActive',
  'TextSelected',
]);
const READING_CONFIDENCES = new Set<ReadingConfidence>(['low', 'medium', 'high']);
const MIN_TEXT_CHUNK_WORD_COUNT = 8;
const CHUNK_SCOPED_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'TextBlockVisible',
  'TextBlockHidden',
  'TextBlockExposureTick',
]);
const PAGE_SCOPED_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'PageVisible',
  'PageHidden',
  'ScrollVelocityChanged',
  'UserIdle',
  'UserActive',
  'TextSelected',
]);
const VISIBILITY_RATIO_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'TextBlockVisible',
  'TextBlockHidden',
  'TextBlockExposureTick',
]);
const PAYLOAD_FREE_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'PageVisible',
  'PageHidden',
]);
const MIN_VISIBLE_BLOCK_RATIO = 0.15;

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
    events.length === 0 ||
    !events.every(isReadingEvent)
  ) {
    return false;
  }

  return hasConsistentBatchLinks(page, chunks, events);
}

function hasConsistentBatchLinks(page: PageSnapshot, chunks: TextChunkSnapshot[], events: ReadingEvent[]): boolean {
  const chunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const eventIds = new Set(events.map((event) => event.id));
  const eventSessionIds = new Set(events.map((event) => event.sessionId));
  const totalChunkWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);

  return (
    chunkIds.size === chunks.length &&
    page.totalWords === totalChunkWords &&
    eventIds.size === events.length &&
    eventSessionIds.size <= 1 &&
    hasChronologicalEvents(events) &&
    chunks.every((chunk) => chunk.pageId === page.pageId) &&
    events.every((event) => {
      if (event.pageId !== page.pageId) {
        return false;
      }

      if (event.occurredAt < page.capturedAt) {
        return false;
      }

      if (PAGE_SCOPED_READING_EVENT_KINDS.has(event.kind)) {
        return event.chunkId === undefined;
      }

      if (CHUNK_SCOPED_READING_EVENT_KINDS.has(event.kind)) {
        if (event.chunkId === undefined || !chunkIds.has(event.chunkId)) {
          return false;
        }

        const chunk = chunksById.get(event.chunkId);
        return !VISIBILITY_RATIO_READING_EVENT_KINDS.has(event.kind) || event.value?.wordCount === chunk?.wordCount;
      }

      return false;
    })
  );
}

function hasChronologicalEvents(events: ReadingEvent[]): boolean {
  return events.every((event, index) => index === 0 || event.occurredAt >= events[index - 1].occurredAt);
}

function isPageSnapshot(value: unknown): value is PageSnapshot {
  return (
    isObject(value) &&
    isNonBlankString(value.pageId) &&
    isNonBlankString(value.domain) &&
    value.pageId.startsWith(`${value.domain}_`) &&
    isNonBlankString(value.titleHash) &&
    isNonBlankString(value.urlHash) &&
    value.language === 'en' &&
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
    isNonBlankString(value.text) &&
    hasConsistentChunkTextSnapshot(value, value.pageId, value.text) &&
    isFiniteNumberAtLeast(value.wordCount, MIN_TEXT_CHUNK_WORD_COUNT) &&
    isPositiveFiniteNumber(value.sentenceCount) &&
    isNonBlankString(value.selector)
  );
}

function hasConsistentChunkTextSnapshot(value: Record<string, unknown>, pageId: string, text: string): boolean {
  const analysis = analyzeEnglishText(text);

  return (
    value.textHash === hashText(text) &&
    value.chunkId === createChunkId(pageId, text) &&
    value.wordCount === analysis.wordCount &&
    value.sentenceCount === analysis.sentenceCount
  );
}

function isReadingEvent(value: unknown): value is ReadingEvent {
  if (
    !(
      isObject(value) &&
      isNonBlankString(value.id) &&
      isNonBlankString(value.sessionId) &&
      hasCollectorSessionIdShape(value.sessionId) &&
      isNonBlankString(value.pageId) &&
      (value.chunkId === undefined || isNonBlankString(value.chunkId)) &&
      isNonBlankString(value.kind) &&
      SUPPORTED_READING_EVENT_KINDS.has(value.kind as ReadingEventKind) &&
      hasMatchingEventIdKindPrefix(value.id, value.kind as ReadingEventKind) &&
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

function hasMatchingEventIdKindPrefix(id: string, kind: ReadingEventKind): boolean {
  const prefix = `${kind}_`;
  return id.startsWith(prefix) && id.length > prefix.length;
}

function hasCollectorSessionIdShape(sessionId: string): boolean {
  return sessionId.startsWith('session_') && sessionId.length > 'session_'.length;
}

function hasValidReadingEventValue(kind: ReadingEventKind, value: unknown): boolean {
  if (kind === 'TextBlockExposureTick') {
    return (
      isObject(value) &&
      isPositiveFiniteNumber(value.dwellMs) &&
      isUnitIntervalFiniteNumber(value.visibleRatio) &&
      value.visibleRatio >= MIN_VISIBLE_BLOCK_RATIO &&
      isPositiveFiniteNumber(value.wordCount) &&
      isBoolean(value.activeTab) &&
      isNonNegativeFiniteNumber(value.scrollSpeedWordsPerMinute) &&
      isBoolean(value.idle)
    );
  }

  if (VISIBILITY_RATIO_READING_EVENT_KINDS.has(kind)) {
    if (!isObject(value) || !isUnitIntervalFiniteNumber(value.visibleRatio) || !isPositiveFiniteNumber(value.wordCount)) {
      return false;
    }

    if (kind === 'TextBlockVisible') {
      return value.visibleRatio >= MIN_VISIBLE_BLOCK_RATIO;
    }

    if (kind === 'TextBlockHidden') {
      return value.visibleRatio < MIN_VISIBLE_BLOCK_RATIO;
    }

    return true;
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

  if (PAYLOAD_FREE_READING_EVENT_KINDS.has(kind)) {
    return value === undefined;
  }

  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
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
