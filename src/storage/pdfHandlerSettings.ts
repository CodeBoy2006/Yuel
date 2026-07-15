export const PDF_HANDLER_SETTINGS_KEY = 'pdfHandlerSettings';

export interface PdfHandlerSettings {
  openPdfInYuel: boolean;
}

export const DEFAULT_PDF_HANDLER_SETTINGS: PdfHandlerSettings = {
  openPdfInYuel: true,
};

export interface PdfHandlerSettingsStore {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<unknown>;
}

export async function getPdfHandlerSettings(
  store: PdfHandlerSettingsStore | undefined = getDefaultPdfHandlerSettingsStore(),
): Promise<PdfHandlerSettings> {
  if (!store) return { ...DEFAULT_PDF_HANDLER_SETTINGS };

  const result = await store.get(PDF_HANDLER_SETTINGS_KEY);
  return normalizePdfHandlerSettings(result[PDF_HANDLER_SETTINGS_KEY]);
}

export async function savePdfHandlerSettings(
  settings: PdfHandlerSettings,
  store: PdfHandlerSettingsStore | undefined = getDefaultPdfHandlerSettingsStore(),
): Promise<PdfHandlerSettings> {
  const normalizedSettings = normalizePdfHandlerSettings(settings);
  if (store) {
    await store.set({ [PDF_HANDLER_SETTINGS_KEY]: normalizedSettings });
  }
  return normalizedSettings;
}

export function normalizePdfHandlerSettings(value: unknown): PdfHandlerSettings {
  if (!isRecord(value)) return { ...DEFAULT_PDF_HANDLER_SETTINGS };

  return {
    openPdfInYuel: typeof value.openPdfInYuel === 'boolean'
      ? value.openPdfInYuel
      : DEFAULT_PDF_HANDLER_SETTINGS.openPdfInYuel,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDefaultPdfHandlerSettingsStore(): PdfHandlerSettingsStore | undefined {
  if (typeof browser === 'undefined' || !browser.storage?.local) return undefined;
  return browser.storage.local as unknown as PdfHandlerSettingsStore;
}
