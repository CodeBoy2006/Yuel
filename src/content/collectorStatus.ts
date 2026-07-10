import { browser } from 'wxt/browser';

import {
  isReadingCollectorStatusRequest,
  MESSAGE_TYPES,
  type ReadingCollectorStatusResponse,
} from '../messaging/contracts';

type CollectorStatusMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: ReadingCollectorStatusResponse) => void,
) => void;

export interface CollectorStatusRuntime {
  onMessage: {
    addListener: (listener: CollectorStatusMessageListener) => void;
    removeListener: (listener: CollectorStatusMessageListener) => void;
  };
}

export interface CollectorStatusSnapshot {
  url: string;
  collecting: boolean;
}

export function registerCollectorStatusResponder(
  getStatus: () => CollectorStatusSnapshot,
  runtime: CollectorStatusRuntime = browser.runtime as unknown as CollectorStatusRuntime,
): () => void {
  const handleMessage: CollectorStatusMessageListener = (message, _sender, sendResponse) => {
    if (!isReadingCollectorStatusRequest(message)) return;

    sendResponse({
      type: MESSAGE_TYPES.readingCollectorStatusResponse,
      ...getStatus(),
    });
  };

  runtime.onMessage.addListener(handleMessage);
  return () => runtime.onMessage.removeListener(handleMessage);
}
