import { browser } from 'wxt/browser';

import { MESSAGE_TYPES } from './contracts';

interface ReadingToolbarRefreshResponse {
  ok: boolean;
}

export async function requestReadingToolbarIconRefresh(): Promise<void> {
  const response = await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.readingToolbarRefreshRequest,
  }) as ReadingToolbarRefreshResponse | undefined;

  if (!response?.ok) {
    throw new Error('Yuel background rejected the toolbar icon refresh.');
  }
}
