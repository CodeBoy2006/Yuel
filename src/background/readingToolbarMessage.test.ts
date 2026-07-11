import { describe, expect, it, vi } from 'vitest';

import { MESSAGE_TYPES } from '../messaging/contracts';
import {
  handleReadingToolbarRuntimeMessage,
  respondToReadingToolbarRuntimeMessage,
} from './readingToolbarMessage';

describe('reading toolbar runtime messages', () => {
  it('ignores unrelated runtime messages', () => {
    const syncToolbarIcon = vi.fn(async () => undefined);

    expect(handleReadingToolbarRuntimeMessage(
      { type: 'other.message' },
      { syncToolbarIcon },
    )).toBeUndefined();
    expect(syncToolbarIcon).not.toHaveBeenCalled();
  });

  it('refreshes the icon for the dedicated request', async () => {
    const syncToolbarIcon = vi.fn(async () => undefined);

    const pending = handleReadingToolbarRuntimeMessage(
      { type: MESSAGE_TYPES.readingToolbarRefreshRequest },
      { syncToolbarIcon },
    );

    await expect(pending).resolves.toBeUndefined();
    expect(syncToolbarIcon).toHaveBeenCalledOnce();
  });

  it('keeps Chrome 116 response channels open and reports refresh failures', async () => {
    const sendResponse = vi.fn();

    const keepChannelOpen = respondToReadingToolbarRuntimeMessage(
      { type: MESSAGE_TYPES.readingToolbarRefreshRequest },
      sendResponse,
      {
        syncToolbarIcon: async () => {
          throw new Error('action unavailable');
        },
      },
    );

    expect(keepChannelOpen).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    });
  });
});
