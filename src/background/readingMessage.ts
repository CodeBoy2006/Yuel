import {
  isReadingEventBatchMessage,
  isReadingEventBatchPayload,
  isReadingEventReferenceBatchMessage,
  isReadingPageSnapshotRegistrationMessage,
  type ReadingEventBatchPayload,
} from '../messaging/contracts';
import { recordReadingEventBatch } from '../storage/repositories';
import { canRecordReadingBatch, type ReadingMessageSender } from './readingAccess';
import {
  readingPageSnapshotRegistry,
  type ReadingPageSnapshotRegistry,
} from './readingSnapshotRegistry';
import { syncReadingToolbarIcon } from './readingToolbar';

export type ReadingEventBatchRecorder = typeof recordReadingEventBatch;
export type ReadingEventBatchAuthorizer = typeof canRecordReadingBatch;
export type ReadingToolbarIconSyncer = () => Promise<unknown>;

export interface ReadingMessageDependencies {
  authorize?: ReadingEventBatchAuthorizer;
  recordBatch?: ReadingEventBatchRecorder;
  snapshotRegistry?: ReadingPageSnapshotRegistry;
  syncToolbarIcon?: ReadingToolbarIconSyncer;
}

export interface ReadingMessageResponse {
  ok: boolean;
  accepted?: boolean;
  reason?: 'snapshot-missing' | 'invalid-snapshot-reference' | 'snapshot-registration-rejected';
  snapshotRegistered?: boolean;
}

export function handleReadingRuntimeMessage(
  message: unknown,
  sender?: ReadingMessageSender,
  {
    authorize = canRecordReadingBatch,
    recordBatch = recordReadingEventBatch,
    snapshotRegistry = readingPageSnapshotRegistry,
    syncToolbarIcon = syncReadingToolbarIcon,
  }: ReadingMessageDependencies = {},
): Promise<ReadingMessageResponse> | undefined {
  if (isReadingPageSnapshotRegistrationMessage(message)) {
    const { snapshotId, page, chunks, events } = message.payload;
    const payload = { page, chunks, events };

    return (async () => {
      const allowed = await authorizeReadingBatch(payload, sender, authorize);
      if (allowed === undefined) {
        return { ok: false };
      }
      if (!allowed) {
        return { ok: true, accepted: false };
      }
      if (!snapshotRegistry.register(snapshotId, { page, chunks }, sender)) {
        return { ok: false, reason: 'snapshot-registration-rejected' };
      }

      return recordAuthorizedReadingBatch(payload, recordBatch, syncToolbarIcon, {
        snapshotRegistered: true,
      });
    })();
  }

  if (isReadingEventReferenceBatchMessage(message)) {
    return (async () => {
      const snapshot = snapshotRegistry.resolve(message.payload.snapshotId, sender);
      if (!snapshot) {
        return { ok: false, reason: 'snapshot-missing' };
      }

      const payload: ReadingEventBatchPayload = {
        ...snapshot,
        events: message.payload.events,
      };
      if (!isReadingEventBatchPayload(payload)) {
        return { ok: false, reason: 'invalid-snapshot-reference' };
      }

      return authorizeAndRecordReadingBatch(
        payload,
        sender,
        authorize,
        recordBatch,
        syncToolbarIcon,
      );
    })();
  }

  if (isReadingEventBatchMessage(message)) {
    return authorizeAndRecordReadingBatch(
      message.payload,
      sender,
      authorize,
      recordBatch,
      syncToolbarIcon,
    );
  }

  return undefined;
}

async function authorizeAndRecordReadingBatch(
  payload: ReadingEventBatchPayload,
  sender: ReadingMessageSender | undefined,
  authorize: ReadingEventBatchAuthorizer,
  recordBatch: ReadingEventBatchRecorder,
  syncToolbarIcon: ReadingToolbarIconSyncer,
): Promise<ReadingMessageResponse> {
  const allowed = await authorizeReadingBatch(payload, sender, authorize);
  if (allowed === undefined) {
    return { ok: false };
  }
  if (!allowed) {
    return { ok: true, accepted: false };
  }

  return recordAuthorizedReadingBatch(payload, recordBatch, syncToolbarIcon);
}

async function authorizeReadingBatch(
  payload: ReadingEventBatchPayload,
  sender: ReadingMessageSender | undefined,
  authorize: ReadingEventBatchAuthorizer,
): Promise<boolean | undefined> {
  try {
    return await authorize(payload, sender);
  } catch (error) {
    console.error('Failed to authorize Yuel reading batch', error);
    return undefined;
  }
}

async function recordAuthorizedReadingBatch(
  payload: ReadingEventBatchPayload,
  recordBatch: ReadingEventBatchRecorder,
  syncToolbarIcon: ReadingToolbarIconSyncer,
  responseDetails: Pick<ReadingMessageResponse, 'snapshotRegistered'> = {},
): Promise<ReadingMessageResponse> {
  try {
    await recordBatch(payload);
  } catch (error) {
    console.error('Failed to record Yuel reading batch', error);
    return {
      ok: false,
      ...responseDetails,
    };
  }

  try {
    await syncToolbarIcon();
  } catch (error) {
    // Reading data is already durable. Toolbar feedback is best-effort and
    // must not make the collector retry a successfully stored batch.
    console.error('Failed to refresh Yuel reading toolbar icon', error);
  }

  return {
    ok: true,
    ...responseDetails,
  };
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
    (response) => sendResponse(response),
    () => sendResponse({ ok: false }),
  );
  // Chrome 116 requires a literal true to keep sendResponse valid after the
  // listener returns; returning the Promise itself is only supported much later.
  return true;
}
