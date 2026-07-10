export const SHARE_CARD_THEME_IDS = ['forest', 'mist', 'midnight', 'berry'] as const;
export const SHARE_CARD_SITE_LIMITS = [1, 2, 3] as const;

export type ShareCardThemeId = (typeof SHARE_CARD_THEME_IDS)[number];
export type ShareCardSiteLimit = (typeof SHARE_CARD_SITE_LIMITS)[number];

export interface ShareCardSettings {
  theme: ShareCardThemeId;
  siteLimit: ShareCardSiteLimit;
  showSiteIcons: boolean;
  showStreak: boolean;
}

export const SHARE_CARD_SETTINGS_KEY = 'shareCardSettings';

export const DEFAULT_SHARE_CARD_SETTINGS: ShareCardSettings = {
  theme: 'forest',
  siteLimit: 3,
  showSiteIcons: true,
  showStreak: true,
};

export interface ShareCardSettingsStore {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<unknown>;
}

export async function getShareCardSettings(
  store: ShareCardSettingsStore | undefined = getDefaultShareCardSettingsStore(),
): Promise<ShareCardSettings> {
  if (!store) return { ...DEFAULT_SHARE_CARD_SETTINGS };

  const result = await store.get(SHARE_CARD_SETTINGS_KEY);
  return normalizeShareCardSettings(result[SHARE_CARD_SETTINGS_KEY]);
}

export async function saveShareCardSettings(
  settings: ShareCardSettings,
  store: ShareCardSettingsStore | undefined = getDefaultShareCardSettingsStore(),
): Promise<ShareCardSettings> {
  const normalizedSettings = normalizeShareCardSettings(settings);
  if (store) {
    await store.set({ [SHARE_CARD_SETTINGS_KEY]: normalizedSettings });
  }
  return normalizedSettings;
}

export function normalizeShareCardSettings(value: unknown): ShareCardSettings {
  if (!isRecord(value)) return { ...DEFAULT_SHARE_CARD_SETTINGS };

  return {
    theme: isShareCardThemeId(value.theme) ? value.theme : DEFAULT_SHARE_CARD_SETTINGS.theme,
    siteLimit: isShareCardSiteLimit(value.siteLimit) ? value.siteLimit : DEFAULT_SHARE_CARD_SETTINGS.siteLimit,
    showSiteIcons: typeof value.showSiteIcons === 'boolean'
      ? value.showSiteIcons
      : DEFAULT_SHARE_CARD_SETTINGS.showSiteIcons,
    showStreak: typeof value.showStreak === 'boolean'
      ? value.showStreak
      : DEFAULT_SHARE_CARD_SETTINGS.showStreak,
  };
}

function isShareCardThemeId(value: unknown): value is ShareCardThemeId {
  return SHARE_CARD_THEME_IDS.some((themeId) => themeId === value);
}

function isShareCardSiteLimit(value: unknown): value is ShareCardSiteLimit {
  return SHARE_CARD_SITE_LIMITS.some((limit) => limit === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDefaultShareCardSettingsStore(): ShareCardSettingsStore | undefined {
  if (typeof browser === 'undefined' || !browser.storage?.local) return undefined;
  return browser.storage.local as unknown as ShareCardSettingsStore;
}
