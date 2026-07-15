import { browser } from 'wxt/browser';

import {
  isSavedSelectionFeedbackMessage,
  type SavedSelectionFeedbackMessage,
} from '../messaging/savedSelectionFeedback';

type SavedSelectionFeedbackListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => void;

export interface SavedSelectionFeedbackRuntime {
  onMessage: {
    addListener(listener: SavedSelectionFeedbackListener): void;
    removeListener(listener: SavedSelectionFeedbackListener): void;
  };
}

export interface SavedSelectionFeedbackEnvironment {
  document: Document;
  clearTimeout(timer: number): void;
  setTimeout(callback: () => void, delay: number): number;
}

const FEEDBACK_HOST_ID = 'yuel-saved-selection-feedback';
const FEEDBACK_DURATION_MS = 2_400;

export function registerSavedSelectionFeedback(
  runtime: SavedSelectionFeedbackRuntime = browser.runtime as unknown as SavedSelectionFeedbackRuntime,
  environment: SavedSelectionFeedbackEnvironment = {
    document,
    clearTimeout: (timer) => window.clearTimeout(timer),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  },
): () => void {
  let dismissTimer: number | undefined;
  let feedbackHost: HTMLElement | undefined;

  const removeFeedback = () => {
    if (dismissTimer !== undefined) {
      environment.clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    feedbackHost?.remove();
    feedbackHost = undefined;
  };

  const showFeedback = (message: SavedSelectionFeedbackMessage) => {
    removeFeedback();
    const host = environment.document.createElement('div');
    host.id = FEEDBACK_HOST_ID;
    feedbackHost = host;
    const shadow = host.attachShadow({ mode: 'open' });
    const status = environment.document.createElement('div');
    status.className = `feedback feedback--${message.status}`;
    status.setAttribute('role', message.status === 'failed' ? 'alert' : 'status');
    status.setAttribute('aria-live', message.status === 'failed' ? 'assertive' : 'polite');

    const mark = environment.document.createElement('span');
    mark.className = 'feedback__mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = message.status === 'saved' ? '✓' : '!';

    const text = environment.document.createElement('span');
    text.textContent = message.status === 'saved'
      ? '已保存到阅量摘录'
      : '摘录保存失败，请重试';

    const style = environment.document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        top: 18px;
        right: 18px;
        max-width: min(320px, calc(100vw - 36px));
        color-scheme: light;
        pointer-events: none;
      }
      .feedback {
        display: flex;
        min-height: 42px;
        box-sizing: border-box;
        align-items: center;
        gap: 10px;
        border: 1px solid rgb(34 73 54 / 24%);
        border-radius: 10px;
        padding: 9px 12px;
        background: rgb(249 252 250 / 98%);
        color: rgb(23 49 37);
        box-shadow: 0 6px 8px rgb(23 49 37 / 12%);
        font: 650 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        animation: yuel-feedback-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .feedback--failed {
        border-color: rgb(143 52 44 / 28%);
        background: rgb(255 250 249 / 98%);
        color: rgb(112 37 31);
      }
      .feedback__mark {
        display: grid;
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 50%;
        background: rgb(35 112 75);
        color: white;
        font: 760 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .feedback--failed .feedback__mark {
        background: rgb(157 58 48);
      }
      @keyframes yuel-feedback-in {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .feedback { animation: none; }
      }
    `;

    shadow.append(style, status);
    status.append(mark, text);
    environment.document.documentElement.append(host);
    dismissTimer = environment.setTimeout(removeFeedback, FEEDBACK_DURATION_MS);
  };

  const handleMessage: SavedSelectionFeedbackListener = (message) => {
    if (isSavedSelectionFeedbackMessage(message)) {
      showFeedback(message);
    }
  };

  runtime.onMessage.addListener(handleMessage);
  return () => {
    runtime.onMessage.removeListener(handleMessage);
    removeFeedback();
  };
}
