import { isReadingEventBatchMessage } from '../messaging/contracts';
import { recordReadingEventBatch } from '../storage/repositories';

export type ReadingEventBatchRecorder = typeof recordReadingEventBatch;

export function handleReadingRuntimeMessage(
  message: unknown,
  recordBatch: ReadingEventBatchRecorder = recordReadingEventBatch,
): Promise<void> | undefined {
  if (!isReadingEventBatchMessage(message)) {
    return undefined;
  }

  return recordBatch(message.payload).catch((error) => {
    console.error('Failed to record Yuel reading batch', error);
    throw error;
  });
}
