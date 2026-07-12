export const READING_TOOLBAR_SETTINGS_KEY = 'readingToolbarSettings';

export interface ReadingToolbarSettings {
  progressIconEnabled: boolean;
}

export const DEFAULT_READING_TOOLBAR_SETTINGS: ReadingToolbarSettings = {
  progressIconEnabled: true,
};

export interface ReadingToolbarSettingsStore {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<unknown>;
}

export async function getReadingToolbarSettings(
  store: ReadingToolbarSettingsStore | undefined = getDefaultReadingToolbarSettingsStore(),
): Promise<ReadingToolbarSettings> {
  if (!store) return { ...DEFAULT_READING_TOOLBAR_SETTINGS };

  const result = await store.get(READING_TOOLBAR_SETTINGS_KEY);
  return normalizeReadingToolbarSettings(result[READING_TOOLBAR_SETTINGS_KEY]);
}

export async function saveReadingToolbarSettings(
  settings: ReadingToolbarSettings,
  store: ReadingToolbarSettingsStore | undefined = getDefaultReadingToolbarSettingsStore(),
): Promise<ReadingToolbarSettings> {
  const normalizedSettings = normalizeReadingToolbarSettings(settings);
  if (store) {
    await store.set({ [READING_TOOLBAR_SETTINGS_KEY]: normalizedSettings });
  }
  return normalizedSettings;
}

export function normalizeReadingToolbarSettings(value: unknown): ReadingToolbarSettings {
  if (!isRecord(value)) return { ...DEFAULT_READING_TOOLBAR_SETTINGS };

  return {
    progressIconEnabled: typeof value.progressIconEnabled === 'boolean'
      ? value.progressIconEnabled
      : DEFAULT_READING_TOOLBAR_SETTINGS.progressIconEnabled,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDefaultReadingToolbarSettingsStore(): ReadingToolbarSettingsStore | undefined {
  if (typeof browser === 'undefined' || !browser.storage?.local) return undefined;
  return browser.storage.local as unknown as ReadingToolbarSettingsStore;
}
