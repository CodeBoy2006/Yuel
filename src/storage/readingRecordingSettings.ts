import { withCrossContextLock } from '../permissions/crossContextLock';

export const READING_RECORDING_SETTINGS_KEY = 'readingRecordingSettings';

const READING_RECORDING_SETTINGS_LOCK = 'yuel-reading-recording-settings';

export interface ReadingRecordingSettings {
  recordingEnabled: boolean;
  excludedSiteDomains: string[];
}

export const DEFAULT_READING_RECORDING_SETTINGS: ReadingRecordingSettings = {
  recordingEnabled: true,
  excludedSiteDomains: [],
};

export interface ReadingRecordingSettingsStore {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<unknown>;
}

export async function getReadingRecordingSettings(
  store: ReadingRecordingSettingsStore | undefined = getDefaultReadingRecordingSettingsStore(),
): Promise<ReadingRecordingSettings> {
  if (!store) return cloneDefaultSettings();

  const result = await store.get(READING_RECORDING_SETTINGS_KEY);
  return normalizeReadingRecordingSettings(result[READING_RECORDING_SETTINGS_KEY]);
}

export async function saveReadingRecordingSettings(
  settings: ReadingRecordingSettings,
  store: ReadingRecordingSettingsStore | undefined = getDefaultReadingRecordingSettingsStore(),
): Promise<ReadingRecordingSettings> {
  const normalizedSettings = normalizeReadingRecordingSettings(settings);
  if (store) {
    await store.set({ [READING_RECORDING_SETTINGS_KEY]: normalizedSettings });
  }
  return normalizedSettings;
}

export function setGlobalReadingRecordingEnabled(
  recordingEnabled: boolean,
  store: ReadingRecordingSettingsStore | undefined = getDefaultReadingRecordingSettingsStore(),
): Promise<ReadingRecordingSettings> {
  return withCrossContextLock(READING_RECORDING_SETTINGS_LOCK, async () => {
    const currentSettings = await getReadingRecordingSettings(store);
    return saveReadingRecordingSettings({ ...currentSettings, recordingEnabled }, store);
  });
}

export function setSiteReadingRecordingEnabled(
  url: string,
  enabled: boolean,
  store: ReadingRecordingSettingsStore | undefined = getDefaultReadingRecordingSettingsStore(),
): Promise<ReadingRecordingSettings> {
  const domain = getReadingSiteDomain(url);
  if (!domain) {
    return Promise.reject(new Error('Reading recording settings require an HTTP or HTTPS page URL.'));
  }

  return withCrossContextLock(READING_RECORDING_SETTINGS_LOCK, async () => {
    const currentSettings = await getReadingRecordingSettings(store);
    const excludedSiteDomains = enabled
      ? currentSettings.excludedSiteDomains.filter((candidate) => candidate !== domain)
      : [...currentSettings.excludedSiteDomains, domain];

    return saveReadingRecordingSettings({
      ...currentSettings,
      excludedSiteDomains,
    }, store);
  });
}

export function normalizeReadingRecordingSettings(value: unknown): ReadingRecordingSettings {
  if (!isRecord(value)) return cloneDefaultSettings();

  const excludedSiteDomains = Array.isArray(value.excludedSiteDomains)
    ? value.excludedSiteDomains
      .filter((domain): domain is string => typeof domain === 'string')
      .map(normalizeReadingDomain)
      .filter((domain): domain is string => Boolean(domain))
    : [];

  return {
    recordingEnabled: typeof value.recordingEnabled === 'boolean'
      ? value.recordingEnabled
      : DEFAULT_READING_RECORDING_SETTINGS.recordingEnabled,
    excludedSiteDomains: [...new Set(excludedSiteDomains)].sort(),
  };
}

export function getReadingSiteDomain(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return normalizeReadingDomain(parsed.hostname);
  } catch {
    return undefined;
  }
}

export function normalizeReadingDomain(domain: string): string | undefined {
  const candidate = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!candidate || /[/\\?#@\s]/.test(candidate)) return undefined;

  try {
    const normalized = new URL(`https://${candidate}`).hostname.toLowerCase().replace(/\.$/, '');
    if (!normalized) return undefined;
    return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
  } catch {
    return undefined;
  }
}

export function isReadingRecordingEnabledForDomain(
  settings: ReadingRecordingSettings,
  domain: string,
): boolean {
  const normalizedDomain = normalizeReadingDomain(domain);
  if (!settings.recordingEnabled || !normalizedDomain) return false;
  return !settings.excludedSiteDomains.includes(normalizedDomain);
}

export function isReadingRecordingEnabledForUrl(
  settings: ReadingRecordingSettings,
  url: string,
): boolean {
  const domain = getReadingSiteDomain(url);
  return domain ? isReadingRecordingEnabledForDomain(settings, domain) : false;
}

function cloneDefaultSettings(): ReadingRecordingSettings {
  return {
    recordingEnabled: DEFAULT_READING_RECORDING_SETTINGS.recordingEnabled,
    excludedSiteDomains: [...DEFAULT_READING_RECORDING_SETTINGS.excludedSiteDomains],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDefaultReadingRecordingSettingsStore(): ReadingRecordingSettingsStore | undefined {
  if (typeof browser === 'undefined' || !browser.storage?.local) return undefined;
  return browser.storage.local as unknown as ReadingRecordingSettingsStore;
}
