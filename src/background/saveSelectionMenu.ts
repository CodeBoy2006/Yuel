import { browser } from 'wxt/browser';

import { saveSelectedTextItem } from '../storage/saveItems';

export const SAVE_SELECTION_CONTEXT_MENU_ID = 'yuel.saveSelection';

export interface SaveSelectionMenuRuntime {
  contextMenus: {
    create: (properties: { id: string; title: string; contexts: ['selection'] }) => number | string;
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
  url?: string;
}

interface RegisterSaveSelectionContextMenuOptions {
  runtime?: SaveSelectionMenuRuntime;
  saveSelection?: typeof saveSelectedTextItem;
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
    title: 'Save selection to Yuel',
    contexts: ['selection'],
  });
}

export function registerSaveSelectionClickHandler({
  runtime = browser,
  saveSelection = saveSelectedTextItem,
}: RegisterSaveSelectionContextMenuOptions = {}): void {
  runtime.contextMenus.onClicked.addListener((info, tab) => {
    void handleSaveSelectionMenuClick(info, tab, { saveSelection }).catch((error) => {
      console.error('Failed to save selected text to Yuel', error);
    });
  });
}

export async function handleSaveSelectionMenuClick(
  info: SaveSelectionClickInfo,
  tab: SaveSelectionTab | undefined,
  { saveSelection = saveSelectedTextItem }: HandleSaveSelectionMenuClickOptions = {},
): Promise<void> {
  if (info.menuItemId !== SAVE_SELECTION_CONTEXT_MENU_ID) {
    return;
  }

  const selectedText = info.selectionText?.trim();
  if (!selectedText) {
    return;
  }

  await saveSelection(selectedText, {
    sourceUrl: info.pageUrl ?? tab?.url,
    createdAt: Date.now(),
  });
}
