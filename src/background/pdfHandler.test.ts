import { describe, expect, it, vi } from 'vitest';

import type { BrowserMimeHandlerApi } from '../pdf/browserHandler';
import {
  createPdfRedirectRules,
  supportsPdfResponseHeaderRules,
  syncPdfHandlerRegistration,
  type PdfDeclarativeNetRequestApi,
} from './pdfHandler';

function createMimeHandlerApi(enabled: boolean): BrowserMimeHandlerApi {
  return {
    getMimeHandlerOptions: vi.fn(async () => ({ enabled })),
    setMimeHandlerOptions: vi.fn(async () => undefined),
    getStreamInfo: vi.fn(async () => {
      throw new Error('unused');
    }),
    abortAndFallbackToNativeHandler: vi.fn(async () => undefined),
  };
}

function createSupportedDnrApi(): PdfDeclarativeNetRequestApi {
  return {
    updateDynamicRules: vi.fn(async () => undefined),
    updateSessionRules: vi.fn(async (options) => {
      const responseHeaders = options.addRules?.[0]?.condition.responseHeaders;
      if (responseHeaders && responseHeaders.length === 0) {
        throw new Error('responseHeaders must not be empty');
      }
    }),
  };
}

describe('PDF handler registration', () => {
  it('builds conservative top-level GET redirect rules', () => {
    const rules = createPdfRedirectRules(
      'chrome-extension://abcdefghijklmnop/pdf-reader.html',
    );

    expect(rules).toHaveLength(3);
    expect(rules[0]).toMatchObject({
      priority: 3,
      action: { type: 'allow' },
      condition: {
        requestMethods: ['get'],
        resourceTypes: ['main_frame'],
        responseHeaders: [{
          header: 'content-disposition',
          values: ['attachment*'],
        }],
      },
    });
    expect(rules[1]).toMatchObject({
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution:
            'chrome-extension://abcdefghijklmnop/pdf-reader.html?DNR:\\0',
        },
      },
      condition: {
        requestMethods: ['get'],
        resourceTypes: ['main_frame'],
        responseHeaders: [{
          header: 'content-type',
          values: ['application/pdf', 'application/pdf;*'],
        }],
      },
    });
    expect(rules[2]?.condition.regexFilter).toBe(
      '^https?://[^?#]+\\.pdf(\\?[^#]*)?$',
    );
  });

  it('uses the native MIME handler and removes fallback rules when available', async () => {
    const dnr = createSupportedDnrApi();
    const mimeHandler = createMimeHandlerApi(false);

    await expect(syncPdfHandlerRegistration({
      dnr,
      getMimeHandlerApi: () => mimeHandler,
      getSettings: async () => ({ openPdfInYuel: true }),
      getViewerUrl: () => 'chrome-extension://yuel/pdf-reader.html',
    })).resolves.toBe('native');

    expect(dnr.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [81_001, 81_002, 81_003],
    });
    expect(mimeHandler.getMimeHandlerOptions).toHaveBeenCalledWith(
      'application/pdf',
    );
    expect(mimeHandler.setMimeHandlerOptions).toHaveBeenCalledWith(
      'application/pdf',
      { enabled: true },
    );
    expect(dnr.updateSessionRules).not.toHaveBeenCalled();
  });

  it('removes fallback rules when the user keeps Chrome as the PDF reader', async () => {
    const dnr = createSupportedDnrApi();

    await expect(syncPdfHandlerRegistration({
      dnr,
      getMimeHandlerApi: () => undefined,
      getSettings: async () => ({ openPdfInYuel: false }),
      getViewerUrl: () => 'chrome-extension://yuel/pdf-reader.html',
    })).resolves.toBe('disabled');

    expect(dnr.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [81_001, 81_002, 81_003],
    });
    expect(dnr.updateSessionRules).not.toHaveBeenCalled();
  });

  it('registers DNR rules when native MIME handling is unavailable', async () => {
    const dnr = createSupportedDnrApi();

    await expect(syncPdfHandlerRegistration({
      dnr,
      getMimeHandlerApi: () => undefined,
      getSettings: async () => ({ openPdfInYuel: true }),
      getViewerUrl: () => 'chrome-extension://yuel/pdf-reader.html',
    })).resolves.toBe('dnr');

    expect(dnr.updateDynamicRules).toHaveBeenCalledOnce();
    expect(dnr.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [81_001, 81_002, 81_003],
      addRules: expect.arrayContaining([
        expect.objectContaining({ id: 81_002 }),
      ]),
    });
  });

  it('fails closed when response-header rule conditions are unsupported', async () => {
    const dnr: PdfDeclarativeNetRequestApi = {
      updateDynamicRules: vi.fn(async () => undefined),
      updateSessionRules: vi.fn(async () => {
        throw new Error('unsupported');
      }),
    };

    await expect(supportsPdfResponseHeaderRules(dnr)).resolves.toBe(false);
    await expect(syncPdfHandlerRegistration({
      dnr,
      getMimeHandlerApi: () => undefined,
      getSettings: async () => ({ openPdfInYuel: true }),
      getViewerUrl: () => 'chrome-extension://yuel/pdf-reader.html',
    })).resolves.toBe('unsupported');
    expect(dnr.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [81_001, 81_002, 81_003],
    });
  });
});
