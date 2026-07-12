import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_READING_RECORDING_SETTINGS,
  READING_RECORDING_SETTINGS_KEY,
  getReadingRecordingSettings,
  isReadingRecordingEnabledForUrl,
  setGlobalReadingRecordingEnabled,
  setSiteReadingRecordingEnabled,
} from './readingRecordingSettings';

function createStore(initialValue?: unknown) {
  let storedValue = initialValue;

  return {
    get: vi.fn(async () => (
      storedValue === undefined
        ? {}
        : { [READING_RECORDING_SETTINGS_KEY]: storedValue }
    )),
    set: vi.fn(async (items: Record<string, unknown>) => {
      storedValue = items[READING_RECORDING_SETTINGS_KEY];
    }),
  };
}

describe('reading recording settings', () => {
  it('records accessible sites by default', async () => {
    const store = createStore();

    await expect(getReadingRecordingSettings(store)).resolves.toEqual(
      DEFAULT_READING_RECORDING_SETTINGS,
    );
  });

  it('normalizes and deduplicates stored site exclusions', async () => {
    const store = createStore({
      recordingEnabled: false,
      excludedSiteDomains: [
        'WWW.Example.com.',
        'example.com',
        'docs.example.com',
        'not a domain',
        42,
      ],
    });

    await expect(getReadingRecordingSettings(store)).resolves.toEqual({
      recordingEnabled: false,
      excludedSiteDomains: ['docs.example.com', 'example.com'],
    });
  });

  it('pauses globally without discarding site preferences', async () => {
    const store = createStore({
      recordingEnabled: true,
      excludedSiteDomains: ['docs.example.com'],
    });

    await expect(setGlobalReadingRecordingEnabled(false, store)).resolves.toEqual({
      recordingEnabled: false,
      excludedSiteDomains: ['docs.example.com'],
    });
    expect(store.set).toHaveBeenLastCalledWith({
      [READING_RECORDING_SETTINGS_KEY]: {
        recordingEnabled: false,
        excludedSiteDomains: ['docs.example.com'],
      },
    });
  });

  it('toggles only the normalized current site domain', async () => {
    const store = createStore();

    const disabled = await setSiteReadingRecordingEnabled(
      'https://www.example.com/article',
      false,
      store,
    );
    expect(disabled).toEqual({
      recordingEnabled: true,
      excludedSiteDomains: ['example.com'],
    });
    expect(isReadingRecordingEnabledForUrl(disabled, 'https://example.com/next')).toBe(false);
    expect(isReadingRecordingEnabledForUrl(disabled, 'https://docs.example.com/next')).toBe(true);

    await expect(setSiteReadingRecordingEnabled(
      'https://example.com/another',
      true,
      store,
    )).resolves.toEqual(DEFAULT_READING_RECORDING_SETTINGS);
  });

  it('serializes global and site mutations so neither preference is lost', async () => {
    const store = createStore();

    await Promise.all([
      setGlobalReadingRecordingEnabled(false, store),
      setSiteReadingRecordingEnabled('https://docs.example.com/article', false, store),
    ]);

    await expect(getReadingRecordingSettings(store)).resolves.toEqual({
      recordingEnabled: false,
      excludedSiteDomains: ['docs.example.com'],
    });
  });
});
