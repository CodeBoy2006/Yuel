import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PDF_HANDLER_SETTINGS,
  getPdfHandlerSettings,
  PDF_HANDLER_SETTINGS_KEY,
  savePdfHandlerSettings,
} from './pdfHandlerSettings';

describe('PDF handler settings', () => {
  it('opens PDFs in Yuel by default', async () => {
    const store = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    };

    await expect(getPdfHandlerSettings(store)).resolves.toEqual(
      DEFAULT_PDF_HANDLER_SETTINGS,
    );
  });

  it('keeps a stored disabled preference and rejects malformed values', async () => {
    const disabledStore = {
      get: vi.fn(async () => ({
        [PDF_HANDLER_SETTINGS_KEY]: { openPdfInYuel: false },
      })),
      set: vi.fn(async () => undefined),
    };
    const invalidStore = {
      get: vi.fn(async () => ({
        [PDF_HANDLER_SETTINGS_KEY]: { openPdfInYuel: 'yes' },
      })),
      set: vi.fn(async () => undefined),
    };

    await expect(getPdfHandlerSettings(disabledStore)).resolves.toEqual({
      openPdfInYuel: false,
    });
    await expect(getPdfHandlerSettings(invalidStore)).resolves.toEqual(
      DEFAULT_PDF_HANDLER_SETTINGS,
    );
  });

  it('persists a normalized preference object', async () => {
    const store = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    };

    await expect(savePdfHandlerSettings({
      openPdfInYuel: false,
    }, store)).resolves.toEqual({
      openPdfInYuel: false,
    });
    expect(store.set).toHaveBeenCalledWith({
      [PDF_HANDLER_SETTINGS_KEY]: {
        openPdfInYuel: false,
      },
    });
  });
});
