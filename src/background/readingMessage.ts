import { isReadingEventBatchMessage } from '../messaging/contracts';
import { recordReadingEventBatch } from '../storage/repositories';
import { canRecordReadingBatch, type ReadingMessageSender } from './readingAccess';

export type ReadingEventBatchRecorder = typeof recordReadingEventBatch;
export type ReadingEventBatchAuthorizer = typeof canRecordReadingBatch;

export interface ReadingMessageDependencies {
  authorize?: ReadingEventBatchAuthorizer;
  recordBatch?: ReadingEventBatchRecorder;
}

export interface ReadingMessageResponse {
  ok: boolean;
}

export function handleReadingRuntimeMessage(
  message: unknown,
  sender?: ReadingMessageSender,
  {
    authorize = canRecordReadingBatch,
    recordBatch = recordReadingEventBatch,
  }: ReadingMessageDependencies = {},
): Promise<void> | undefined {
  if (!isReadingEventBatchMessage(message)) {
    return undefined;
  }

  return (async () => {
    let allowed: boolean;
    try {
      allowed = await authorize(message.payload, sender);
    } catch (error) {
      console.error('Failed to authorize Yuel reading batch', error);
      throw error;
    }

    if (!allowed) return;

    try {
      await recordBatch(message.payload);
    } catch (error) {
      console.error('Failed to record Yuel reading batch', error);
      throw error;
    }
  })();
}

export function respondToReadingRuntimeMessage(
  message: unknown,
  sender: ReadingMessageSender | undefined,
  sendResponse: (response: ReadingMessageResponse) => void,
  dependencies: ReadingMessageDependencies = {},
): true | undefined {
  const pending = handleReadingRuntimeMessage(message, sender, dependencies);
  if (!pending) return undefined;

  void pending.then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false }),
  );
  // Chrome 116 requires a literal true to keep sendResponse valid after the
  // listener returns; returning the Promise itself is only supported much later.
  return true;
}
