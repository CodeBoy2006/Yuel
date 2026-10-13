import { browser } from 'wxt/browser';

import {
  createPageSnapshotId,
  type PageSnapshot,
} from '../domain/events';
import {
  MESSAGE_TYPES,
  type ReadingEventBatchPayload,
  type ReadingMessageResponse,
} from './contracts';

export type ReadingEventBatchDelivery = (
  payload: ReadingEventBatchPayload,
) => Promise<boolean>;

export interface ReadingEventsRuntime {
  sendMessage: (message: unknown) => Promise<unknown>;
}

interface ReadingPageSnapshotDeliveryState {
  snapshotId: string;
  registered: boolean;
  suppressed: boolean;
}

export function createReadingEventBatchDelivery(
  runtime: ReadingEventsRuntime = {
    sendMessage: (message) => browser.runtime.sendMessage(message),
  },
): ReadingEventBatchDelivery {
  const pageStates = new WeakMap<PageSnapshot, ReadingPageSnapshotDeliveryState>();

  return async (payload) => {
    try {
      const delivered = payload.page.resourceType === 'pdf'
        ? await deliverLegacyBatch(runtime, payload)
        : await deliverWebBatch(runtime, payload, pageStates);
      if (!delivered) {
        console.warn('Failed to deliver Yuel reading events; will retry on the next flush');
      }
      return delivered;
    } catch (error) {
      console.warn('Failed to deliver Yuel reading events; will retry on the next flush', error);
      return false;
    }
  };
}

export const deliverReadingEventBatch = createReadingEventBatchDelivery();

async function deliverLegacyBatch(
  runtime: ReadingEventsRuntime,
  payload: ReadingEventBatchPayload,
): Promise<boolean> {
  const response = await runtime.sendMessage({
    type: MESSAGE_TYPES.readingEventsBatch,
    payload,
  });
  return readReadingMessageResponse(response)?.ok === true;
}

async function deliverWebBatch(
  runtime: ReadingEventsRuntime,
  payload: ReadingEventBatchPayload,
  pageStates: WeakMap<PageSnapshot, ReadingPageSnapshotDeliveryState>,
): Promise<boolean> {
  let state = pageStates.get(payload.page);
  if (!state) {
    state = {
      snapshotId: createPageSnapshotId(payload.page, payload.chunks),
      registered: false,
      suppressed: false,
    };
    pageStates.set(payload.page, state);
  }
  const { snapshotId } = state;

  if (state.suppressed) {
    return true;
  }

  if (!state.registered) {
    return registerWebSnapshot(runtime, payload, state);
  }

  const response = readReadingMessageResponse(await runtime.sendMessage({
    type: MESSAGE_TYPES.readingEventsReferenceBatch,
    payload: {
      snapshotId,
      events: payload.events,
    },
  }));
  if (response?.ok === true) {
    return true;
  }
  if (response?.reason !== 'snapshot-missing') {
    return false;
  }

  state.registered = false;
  return registerWebSnapshot(runtime, payload, state);
}

async function registerWebSnapshot(
  runtime: ReadingEventsRuntime,
  payload: ReadingEventBatchPayload,
  state: ReadingPageSnapshotDeliveryState,
): Promise<boolean> {
  const response = readReadingMessageResponse(await runtime.sendMessage({
    type: MESSAGE_TYPES.readingPageSnapshotRegister,
    payload: {
      snapshotId: state.snapshotId,
      ...payload,
    },
  }));
  if (!response) {
    return false;
  }
  if (response.accepted === false) {
    state.suppressed = true;
    return true;
  }

  state.registered = response.ok || response.snapshotRegistered === true;
  return response.ok;
}

function readReadingMessageResponse(value: unknown): ReadingMessageResponse | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { ok?: unknown }).ok !== 'boolean'
  ) {
    return undefined;
  }

  return value as ReadingMessageResponse;
}
