import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_READING_TOOLBAR_SETTINGS,
  READING_TOOLBAR_SETTINGS_KEY,
  getReadingToolbarSettings,
  saveReadingToolbarSettings,
} from './readingToolbarSettings';

describe('reading toolbar settings', () => {
  it('keeps the progress icon enabled when no preference has been stored', async () => {
    const store = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    };

    await expect(getReadingToolbarSettings(store)).resolves.toEqual(
      DEFAULT_READING_TOOLBAR_SETTINGS,
    );
  });

  it('falls back only when the stored preference is invalid', async () => {
    const disabledStore = {
      get: vi.fn(async () => ({
        [READING_TOOLBAR_SETTINGS_KEY]: { progressIconEnabled: false },
      })),
      set: vi.fn(async () => undefined),
    };
    const invalidStore = {
      get: vi.fn(async () => ({
        [READING_TOOLBAR_SETTINGS_KEY]: { progressIconEnabled: 'no' },
      })),
      set: vi.fn(async () => undefined),
    };

    await expect(getReadingToolbarSettings(disabledStore)).resolves.toEqual({
      progressIconEnabled: false,
    });
    await expect(getReadingToolbarSettings(invalidStore)).resolves.toEqual(
      DEFAULT_READING_TOOLBAR_SETTINGS,
    );
  });

  it('persists a normalized preference object', async () => {
    const store = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    };
    const settings = { progressIconEnabled: false };

    await expect(saveReadingToolbarSettings(settings, store)).resolves.toEqual(settings);
    expect(store.set).toHaveBeenCalledWith({
      [READING_TOOLBAR_SETTINGS_KEY]: settings,
    });
  });
});
