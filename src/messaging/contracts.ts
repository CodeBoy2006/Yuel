import type { PageSnapshot, ReadingEvent, TextChunkSnapshot } from '../domain/events';

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

export function isReadingEventBatchMessage(message: unknown): message is ReadingEventBatchMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === MESSAGE_TYPES.readingEventsBatch &&
    typeof (message as { payload?: unknown }).payload === 'object'
  );
}
