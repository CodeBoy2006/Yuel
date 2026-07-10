import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SHARE_CARD_SETTINGS,
  SHARE_CARD_SETTINGS_KEY,
  getShareCardSettings,
  saveShareCardSettings,
} from './shareCardSettings';

describe('share card settings', () => {
  it('returns defaults when no preference has been stored', async () => {
    const store = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    };

    await expect(getShareCardSettings(store)).resolves.toEqual(DEFAULT_SHARE_CARD_SETTINGS);
  });

  it('normalizes invalid fields without discarding valid choices', async () => {
    const store = {
      get: vi.fn(async () => ({
        [SHARE_CARD_SETTINGS_KEY]: {
          theme: 'berry',
          siteLimit: 8,
          showSiteIcons: false,
          showStreak: 'yes',
        },
      })),
      set: vi.fn(async () => undefined),
    };

    await expect(getShareCardSettings(store)).resolves.toEqual({
      theme: 'berry',
      siteLimit: DEFAULT_SHARE_CARD_SETTINGS.siteLimit,
      showSiteIcons: false,
      showStreak: DEFAULT_SHARE_CARD_SETTINGS.showStreak,
    });
  });

  it('persists a validated settings object', async () => {
    const store = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    };
    const settings = {
      theme: 'midnight' as const,
      siteLimit: 2 as const,
      showSiteIcons: false,
      showStreak: true,
    };

    await expect(saveShareCardSettings(settings, store)).resolves.toEqual(settings);
    expect(store.set).toHaveBeenCalledWith({ [SHARE_CARD_SETTINGS_KEY]: settings });
  });
});
