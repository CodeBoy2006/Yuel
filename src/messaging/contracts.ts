import { analyzeEnglishText } from '../analysis/english';
import {
  createChunkId,
  createPageSnapshotId,
  hashText,
  type PageSnapshot,
  type ReadingConfidence,
  type ReadingEvent,
  type ReadingEventKind,
  type ReadingResourceType,
  type TextChunkSnapshot,
} from '../domain/events';

export const MESSAGE_TYPES = {
  readingEventsBatch: 'yuel.readingEvents.batch',
  readingPageSnapshotRegister: 'yuel.readingPageSnapshot.register',
  readingEventsReferenceBatch: 'yuel.readingEvents.referenceBatch',
  readingCollectorStatusRequest: 'yuel.readingCollector.status.request',
  readingCollectorStatusResponse: 'yuel.readingCollector.status.response',
  readingToolbarRefreshRequest: 'yuel.readingToolbar.refresh.request',
} as const;

export interface ReadingCollectorStatusRequest {
  type: typeof MESSAGE_TYPES.readingCollectorStatusRequest;
}

export interface ReadingCollectorStatusResponse {
  type: typeof MESSAGE_TYPES.readingCollectorStatusResponse;
  url: string;
  collecting: boolean;
}

export interface ReadingEventBatchPayload {
  page: PageSnapshot;
  chunks: TextChunkSnapshot[];
  events: ReadingEvent[];
}

export interface ReadingEventBatchMessage {
  type: typeof MESSAGE_TYPES.readingEventsBatch;
  payload: ReadingEventBatchPayload;
}

export interface ReadingMessageResponse {
  ok: boolean;
  accepted?: boolean;
  reason?: 'snapshot-missing' | 'invalid-snapshot-reference' | 'snapshot-registration-rejected';
  snapshotRegistered?: boolean;
}

export interface ReadingPageSnapshotRegistrationPayload extends ReadingEventBatchPayload {
  snapshotId: string;
}

export interface ReadingPageSnapshotRegistrationMessage {
  type: typeof MESSAGE_TYPES.readingPageSnapshotRegister;
  payload: ReadingPageSnapshotRegistrationPayload;
}

export interface ReadingEventReferenceBatchPayload {
  snapshotId: string;
  events: ReadingEvent[];
}

export interface ReadingEventReferenceBatchMessage {
  type: typeof MESSAGE_TYPES.readingEventsReferenceBatch;
  payload: ReadingEventReferenceBatchPayload;
}

export interface ReadingToolbarRefreshRequest {
  type: typeof MESSAGE_TYPES.readingToolbarRefreshRequest;
}

const SUPPORTED_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'PageVisible',
  'PageHidden',
  'TextBlockVisible',
  'TextBlockHidden',
  'TextViewportExposureTick',
  'ScrollVelocityChanged',
  'ScrollCoordinatesReset',
  'UserIdle',
  'UserActive',
  'TextSelected',
]);
const READING_CONFIDENCES = new Set<ReadingConfidence>(['low', 'medium', 'high']);
const READING_RESOURCE_TYPES = new Set<ReadingResourceType>(['web', 'pdf']);
const MIN_TEXT_CHUNK_WORD_COUNT = 8;
const CHUNK_SCOPED_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'TextBlockVisible',
  'TextBlockHidden',
]);
const PAGE_SCOPED_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'PageVisible',
  'PageHidden',
  'TextViewportExposureTick',
  'ScrollVelocityChanged',
  'ScrollCoordinatesReset',
  'UserIdle',
  'UserActive',
  'TextSelected',
]);
const VISIBILITY_RATIO_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'TextBlockVisible',
  'TextBlockHidden',
]);
const PAYLOAD_FREE_READING_EVENT_KINDS = new Set<ReadingEventKind>([
  'PageVisible',
  'PageHidden',
  'ScrollCoordinatesReset',
]);
const MIN_VISIBLE_BLOCK_RATIO = 0.15;

export function isReadingEventBatchMessage(message: unknown): message is ReadingEventBatchMessage {
  return (
    isObject(message) &&
    message.type === MESSAGE_TYPES.readingEventsBatch &&
    isReadingEventBatchPayload(message.payload)
  );
}

export function isReadingPageSnapshotRegistrationMessage(
  message: unknown,
): message is ReadingPageSnapshotRegistrationMessage {
  if (
    !isObject(message) ||
    message.type !== MESSAGE_TYPES.readingPageSnapshotRegister ||
    !isObject(message.payload)
  ) {
    return false;
  }

  const { snapshotId, page, chunks, events } = message.payload;
  const batchPayload = { page, chunks, events };
  if (
    !isNonBlankString(snapshotId) ||
    !isReadingEventBatchPayload(batchPayload) ||
    batchPayload.page.resourceType === 'pdf'
  ) {
    return false;
  }

  return snapshotId === createPageSnapshotId(batchPayload.page, batchPayload.chunks);
}

export function isReadingEventReferenceBatchMessage(
  message: unknown,
): message is ReadingEventReferenceBatchMessage {
  return (
    isObject(message) &&
    message.type === MESSAGE_TYPES.readingEventsReferenceBatch &&
    isReadingEventReferenceBatchPayload(message.payload)
  );
}

export function isReadingCollectorStatusRequest(message: unknown): message is ReadingCollectorStatusRequest {
  return isObject(message) && message.type === MESSAGE_TYPES.readingCollectorStatusRequest;
}

export function isReadingCollectorStatusResponse(value: unknown): value is ReadingCollectorStatusResponse {
  return (
    isObject(value) &&
    value.type === MESSAGE_TYPES.readingCollectorStatusResponse &&
    isNonBlankString(value.url) &&
    isBoolean(value.collecting)
  );
}

export function isReadingToolbarRefreshRequest(message: unknown): message is ReadingToolbarRefreshRequest {
  return isObject(message) && message.type === MESSAGE_TYPES.readingToolbarRefreshRequest;
}

export function isReadingEventBatchPayload(payload: unknown): payload is ReadingEventBatchPayload {
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

function isReadingEventReferenceBatchPayload(
  payload: unknown,
): payload is ReadingEventReferenceBatchPayload {
  if (!isObject(payload)) {
    return false;
  }

  const { snapshotId, events } = payload;
  if (
    !isNonBlankString(snapshotId) ||
    !Array.isArray(events) ||
    events.length === 0 ||
    !events.every(isReadingEvent)
  ) {
    return false;
  }

  const eventIds = new Set(events.map((event) => event.id));
  const eventSessionIds = new Set(events.map((event) => event.sessionId));
  const eventPageIds = new Set(events.map((event) => event.pageId));

  return (
    eventIds.size === events.length &&
    eventSessionIds.size <= 1 &&
    eventPageIds.size <= 1 &&
    hasChronologicalEvents(events) &&
    events.every(hasValidReferenceEventScope)
  );
}

function hasValidReferenceEventScope(event: ReadingEvent): boolean {
  if (PAGE_SCOPED_READING_EVENT_KINDS.has(event.kind)) {
    if (event.chunkId !== undefined) {
      return false;
    }

    return event.kind !== 'TextViewportExposureTick' || hasUniqueVisibleChunkLinks(event.value);
  }

  return CHUNK_SCOPED_READING_EVENT_KINDS.has(event.kind) && event.chunkId !== undefined;
}

function hasUniqueVisibleChunkLinks(value: Record<string, unknown> | undefined): boolean {
  const visibleChunks = value?.visibleChunks;
  if (!Array.isArray(visibleChunks)) {
    return false;
  }

  const chunkIds = new Set<string>();
  return visibleChunks.every((candidate) => {
    if (!isObject(candidate) || !isNonBlankString(candidate.chunkId) || chunkIds.has(candidate.chunkId)) {
      return false;
    }

    chunkIds.add(candidate.chunkId);
    return true;
  });
}

function hasConsistentBatchLinks(page: PageSnapshot, chunks: TextChunkSnapshot[], events: ReadingEvent[]): boolean {
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const eventIds = new Set(events.map((event) => event.id));
  const eventSessionIds = new Set(events.map((event) => event.sessionId));
  const totalChunkWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);

  return (
    chunksById.size === chunks.length &&
    hasConsistentBatchWordTotal(page, totalChunkWords) &&
    eventIds.size === events.length &&
    eventSessionIds.size <= 1 &&
    hasChronologicalEvents(events) &&
    hasConsistentResourceSections(page, chunks) &&
    chunks.every((chunk) => chunk.pageId === page.pageId) &&
    events.every((event) => {
      if (event.pageId !== page.pageId) {
        return false;
      }

      if (event.occurredAt < page.capturedAt) {
        return false;
      }

      if (PAGE_SCOPED_READING_EVENT_KINDS.has(event.kind)) {
        if (event.chunkId !== undefined) {
          return false;
        }

        return event.kind !== 'TextViewportExposureTick' || hasConsistentViewportTickLinks(event.value, chunksById);
      }

      if (CHUNK_SCOPED_READING_EVENT_KINDS.has(event.kind)) {
        if (event.chunkId === undefined || !chunksById.has(event.chunkId)) {
          return false;
        }

        const chunk = chunksById.get(event.chunkId);
        return !VISIBILITY_RATIO_READING_EVENT_KINDS.has(event.kind) || event.value?.wordCount === chunk?.wordCount;
      }

      return false;
    })
  );
}

function hasConsistentBatchWordTotal(
  page: PageSnapshot,
  totalChunkWords: number,
): boolean {
  return page.resourceType === 'pdf'
    ? totalChunkWords <= page.totalWords
    : totalChunkWords === page.totalWords;
}

function hasConsistentResourceSections(page: PageSnapshot, chunks: TextChunkSnapshot[]): boolean {
  if (page.resourceType === undefined) {
    return chunks.every((chunk) => chunk.sectionId === undefined);
  }

  return page.resourceType !== 'pdf' || chunks.every((chunk) => chunk.sectionId !== undefined);
}

function hasConsistentViewportTickLinks(
  value: Record<string, unknown> | undefined,
  chunksById: Map<string, TextChunkSnapshot>,
): boolean {
  const visibleChunks = value?.visibleChunks;
  if (!Array.isArray(visibleChunks)) {
    return false;
  }

  const visibleChunkIds = new Set<string>();
  return visibleChunks.every((candidate) => {
    if (!isObject(candidate) || !isNonBlankString(candidate.chunkId)) {
      return false;
    }

    if (visibleChunkIds.has(candidate.chunkId)) {
      return false;
    }

    visibleChunkIds.add(candidate.chunkId);
    const chunk = chunksById.get(candidate.chunkId);
    return Boolean(chunk && candidate.wordCount === chunk.wordCount);
  });
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
    hasValidResourceIdentity(value) &&
    isNonBlankString(value.titleHash) &&
    isNonBlankString(value.urlHash) &&
    value.language === 'en' &&
    isNonNegativeFiniteNumber(value.totalWords) &&
    (value.metricModelVersion === undefined || (
      Number.isInteger(value.metricModelVersion) &&
      isPositiveFiniteNumber(value.metricModelVersion)
    )) &&
    isNonNegativeFiniteNumber(value.capturedAt)
  );
}

function isTextChunkSnapshot(value: unknown): value is TextChunkSnapshot {
  return (
    isObject(value) &&
    isNonBlankString(value.chunkId) &&
    isNonBlankString(value.pageId) &&
    (value.sectionId === undefined || isNonBlankString(value.sectionId)) &&
    isNonBlankString(value.textHash) &&
    isNonBlankString(value.text) &&
    (value.sourceKey === undefined || isNonBlankString(value.sourceKey)) &&
    hasConsistentChunkTextSnapshot(value, value.pageId, value.text) &&
    isFiniteNumberAtLeast(value.wordCount, MIN_TEXT_CHUNK_WORD_COUNT) &&
    isPositiveFiniteNumber(value.sentenceCount) &&
    isNonBlankString(value.selector)
  );
}

function hasConsistentChunkTextSnapshot(value: Record<string, unknown>, pageId: string, text: string): boolean {
  const analysis = analyzeEnglishText(text);
  const sourceKey = typeof value.sourceKey === 'string' ? value.sourceKey : undefined;

  return (
    value.textHash === hashText(text) &&
    (value.chunkId === createChunkId(pageId, text, sourceKey) || value.chunkId === createChunkId(pageId, text)) &&
    value.wordCount === analysis.wordCount &&
    value.sentenceCount === analysis.sentenceCount
  );
}

function hasValidResourceIdentity(value: Record<string, unknown>): boolean {
  if (value.resourceType === undefined && value.resourceId === undefined) {
    return true;
  }

  return (
    isNonBlankString(value.resourceType) &&
    READING_RESOURCE_TYPES.has(value.resourceType as ReadingResourceType) &&
    isNonBlankString(value.resourceId)
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
  if (kind === 'TextViewportExposureTick') {
    return (
      isObject(value) &&
      isPositiveFiniteNumber(value.tickMs) &&
      isPositiveFiniteNumber(value.baseWordsPerMinute) &&
      isBoolean(value.activeTab) &&
      isBoolean(value.documentVisible) &&
      isNonNegativeFiniteNumber(value.scrollSpeedWordsPerMinute) &&
      (value.scrollDirection === undefined || value.scrollDirection === -1 || value.scrollDirection === 0 || value.scrollDirection === 1) &&
      isNonNegativeFiniteNumber(value.idleAgeMs) &&
      Array.isArray(value.visibleChunks) &&
      value.visibleChunks.length > 0 &&
      value.visibleChunks.every(isVisibleChunkExposureSnapshot)
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
      (value.scrollDirection === -1 || value.scrollDirection === 1) &&
      isNonNegativeFiniteNumber(value.scrollOffsetPx) &&
      isFiniteNumberAtLeast(value.scrollableExtentPx, 1) &&
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

function isVisibleChunkExposureSnapshot(value: unknown): boolean {
  return (
    isObject(value) &&
    isNonBlankString(value.chunkId) &&
    isPositiveFiniteNumber(value.wordCount) &&
    isUnitIntervalFiniteNumber(value.visibleRatio) &&
    value.visibleRatio >= MIN_VISIBLE_BLOCK_RATIO &&
    isNonNegativeFiniteNumber(value.centerDistance) &&
    (value.viewportY === undefined || isFiniteNumber(value.viewportY)) &&
    (value.visibleWordCount === undefined || (
      isNonNegativeFiniteNumber(value.visibleWordCount) &&
      value.visibleWordCount <= value.wordCount
    )) &&
    (value.attentionMass === undefined || isPositiveFiniteNumber(value.attentionMass)) &&
    (value.contentMultiplier === undefined || (
      isPositiveFiniteNumber(value.contentMultiplier) &&
      value.contentMultiplier <= 1
    )) &&
    isFiniteNumber(value.contentWeight) &&
    value.contentWeight > 0 &&
    value.contentWeight <= 1
  );
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
