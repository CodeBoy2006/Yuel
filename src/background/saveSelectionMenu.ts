import { browser } from 'wxt/browser';

import {
  SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE,
  type SavedSelectionFeedbackMessage,
} from '../messaging/savedSelectionFeedback';
import { saveSelectedTextItem } from '../storage/saveItems';

export const SAVE_SELECTION_CONTEXT_MENU_ID = 'yuel.saveSelection';

export interface SaveSelectionMenuRuntime {
  contextMenus: {
    create: (properties: {
      id: string;
      title: string;
      contexts: ['selection'];
      documentUrlPatterns: ['http://*/*', 'https://*/*'];
    }) => number | string;
    remove: (id: string) => Promise<void>;
    onClicked: {
      addListener: (listener: (info: SaveSelectionClickInfo, tab?: SaveSelectionTab) => void) => void;
    };
  };
}

export interface SaveSelectionClickInfo {
  menuItemId: string | number;
  selectionText?: string;
  pageUrl?: string;
}

export interface SaveSelectionTab {
  id?: number;
  title?: string;
  url?: string;
}

type NotifySelectionFeedback = (
  tabId: number | undefined,
  message: SavedSelectionFeedbackMessage,
) => Promise<void>;

interface RegisterSaveSelectionContextMenuOptions {
  runtime?: SaveSelectionMenuRuntime;
  saveSelection?: typeof saveSelectedTextItem;
  notifySelectionFeedback?: NotifySelectionFeedback;
}

interface HandleSaveSelectionMenuClickOptions {
  saveSelection?: typeof saveSelectedTextItem;
}

export async function registerSaveSelectionContextMenu({
  runtime = browser,
}: RegisterSaveSelectionContextMenuOptions = {}): Promise<void> {
  await runtime.contextMenus.remove(SAVE_SELECTION_CONTEXT_MENU_ID).catch(() => undefined);
  runtime.contextMenus.create({
    id: SAVE_SELECTION_CONTEXT_MENU_ID,
    title: '保存到阅量摘录',
    contexts: ['selection'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
  });
}

export function registerSaveSelectionClickHandler({
  runtime = browser,
  saveSelection = saveSelectedTextItem,
  notifySelectionFeedback = sendSelectionFeedback,
}: RegisterSaveSelectionContextMenuOptions = {}): void {
  runtime.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      try {
        const record = await handleSaveSelectionMenuClick(info, tab, { saveSelection });
        if (!record) return;
        await notifySelectionFeedback(tab?.id, {
          type: SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE,
          status: 'saved',
        }).catch(() => undefined);
      } catch (error) {
        console.error('Failed to save selected text to Yuel', error);
        await notifySelectionFeedback(tab?.id, {
          type: SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE,
          status: 'failed',
        }).catch(() => undefined);
      }
    })();
  });
}

export async function handleSaveSelectionMenuClick(
  info: SaveSelectionClickInfo,
  tab: SaveSelectionTab | undefined,
  { saveSelection = saveSelectedTextItem }: HandleSaveSelectionMenuClickOptions = {},
): ReturnType<typeof saveSelectedTextItem> {
  if (info.menuItemId !== SAVE_SELECTION_CONTEXT_MENU_ID) {
    return undefined;
  }

  const selectedText = info.selectionText?.trim();
  if (!selectedText) {
    return undefined;
  }

  return saveSelection(selectedText, {
    sourceUrl: info.pageUrl ?? tab?.url,
    sourceTitle: tab?.title,
    createdAt: Date.now(),
  });
}

async function sendSelectionFeedback(
  tabId: number | undefined,
  message: SavedSelectionFeedbackMessage,
): Promise<void> {
  if (!Number.isSafeInteger(tabId) || (tabId ?? -1) < 0) return;
  await browser.tabs.sendMessage(tabId!, message).catch(() => undefined);
}
