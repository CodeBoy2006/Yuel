import { describe, expect, it, vi } from 'vitest';

import {
  SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE,
} from '../messaging/savedSelectionFeedback';
import {
  registerSavedSelectionFeedback,
  type SavedSelectionFeedbackRuntime,
} from './savedSelectionFeedback';

describe('registerSavedSelectionFeedback', () => {
  it('shows saved and failed feedback in an isolated shadow root', () => {
    let listener: Parameters<SavedSelectionFeedbackRuntime['onMessage']['addListener']>[0] | undefined;
    const removeListener = vi.fn();
    const runtime: SavedSelectionFeedbackRuntime = {
      onMessage: {
        addListener(nextListener) {
          listener = nextListener;
        },
        removeListener,
      },
    };
    const timers = new Map<number, () => void>();
    let timerId = 0;
    const stop = registerSavedSelectionFeedback(runtime, {
      document,
      clearTimeout: (id) => {
        timers.delete(id);
      },
      setTimeout: (callback) => {
        timerId += 1;
        timers.set(timerId, callback);
        return timerId;
      },
    });

    listener?.({
      type: SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE,
      status: 'saved',
    }, {}, vi.fn());

    const savedHost = document.getElementById('yuel-saved-selection-feedback');
    expect(savedHost?.shadowRoot?.textContent).toContain('已保存到阅量摘录');
    expect(savedHost?.shadowRoot?.querySelector('[role="status"]')).not.toBeNull();

    listener?.({
      type: SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE,
      status: 'failed',
    }, {}, vi.fn());

    const failedHost = document.getElementById('yuel-saved-selection-feedback');
    expect(failedHost?.shadowRoot?.textContent).toContain('摘录保存失败，请重试');
    expect(failedHost?.shadowRoot?.querySelector('[role="alert"]')).not.toBeNull();

    stop();
    expect(removeListener).toHaveBeenCalledWith(listener);
    expect(document.getElementById('yuel-saved-selection-feedback')).toBeNull();
  });

  it('never removes a page-owned node that happens to use the feedback id', () => {
    const pageNode = document.createElement('div');
    pageNode.id = 'yuel-saved-selection-feedback';
    document.body.append(pageNode);
    const runtime: SavedSelectionFeedbackRuntime = {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    };

    const stop = registerSavedSelectionFeedback(runtime, {
      document,
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(() => 1),
    });
    stop();

    expect(pageNode.isConnected).toBe(true);
    pageNode.remove();
  });
});
