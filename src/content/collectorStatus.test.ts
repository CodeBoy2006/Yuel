import { describe, expect, it, vi } from 'vitest';

import { MESSAGE_TYPES } from '../messaging/contracts';
import {
  registerCollectorStatusResponder,
  type CollectorStatusRuntime,
} from './collectorStatus';

describe('registerCollectorStatusResponder', () => {
  it('reports the live collector state and unregisters cleanly', () => {
    let listener: Parameters<CollectorStatusRuntime['onMessage']['addListener']>[0] | undefined;
    const removeListener = vi.fn();
    const runtime: CollectorStatusRuntime = {
      onMessage: {
        addListener(nextListener) {
          listener = nextListener;
        },
        removeListener,
      },
    };
    const sendResponse = vi.fn();
    const stop = registerCollectorStatusResponder(() => ({
      url: 'https://example.com/article',
      collecting: true,
    }), runtime);

    listener?.(
      { type: MESSAGE_TYPES.readingCollectorStatusRequest },
      {},
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith({
      type: MESSAGE_TYPES.readingCollectorStatusResponse,
      url: 'https://example.com/article',
      collecting: true,
    });

    stop();
    expect(removeListener).toHaveBeenCalledWith(listener);
  });

  it('ignores unrelated runtime messages', () => {
    let listener: Parameters<CollectorStatusRuntime['onMessage']['addListener']>[0] | undefined;
    const runtime: CollectorStatusRuntime = {
      onMessage: {
        addListener(nextListener) {
          listener = nextListener;
        },
        removeListener: vi.fn(),
      },
    };
    const sendResponse = vi.fn();
    registerCollectorStatusResponder(() => ({
      url: 'https://example.com/article',
      collecting: true,
    }), runtime);

    listener?.({ type: MESSAGE_TYPES.readingEventsBatch }, {}, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
  });
});
