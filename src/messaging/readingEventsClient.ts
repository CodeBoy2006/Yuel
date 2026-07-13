import { browser } from 'wxt/browser';

import { MESSAGE_TYPES, type ReadingEventBatchPayload } from './contracts';

export type ReadingEventBatchDelivery = (
  payload: ReadingEventBatchPayload,
) => Promise<boolean>;

export const deliverReadingEventBatch: ReadingEventBatchDelivery = async (payload) => {
  try {
    const response = await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.readingEventsBatch,
      payload,
    });
    if (!isSuccessfulReadingMessageResponse(response)) {
      throw new Error('Yuel background rejected the reading event batch');
    }
    return true;
  } catch (error) {
    console.warn('Failed to deliver Yuel reading events; will retry on the next flush', error);
    return false;
  }
};

function isSuccessfulReadingMessageResponse(value: unknown): value is { ok: true } {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === true;
}
