import {
  browser,
  type Browser,
} from 'wxt/browser';

import {
  getBrowserMimeHandlerApi,
  PDF_MIME_TYPE,
  type BrowserMimeHandlerApi,
} from '../pdf/browserHandler';
import {
  getPdfHandlerSettings,
  PDF_HANDLER_SETTINGS_KEY,
  type PdfHandlerSettingsStore,
} from '../storage/pdfHandlerSettings';

const PDF_REDIRECT_RULE_IDS = [81_001, 81_002, 81_003] as const;
const PDF_HEADER_PROBE_RULE_ID = 81_099;
const PDF_READER_PATH = '/pdf-reader.html';
let defaultPdfHandlerSyncQueue: Promise<void> = Promise.resolve();

export interface PdfDeclarativeNetRequestApi {
  updateDynamicRules: (
    options: Browser.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
  updateSessionRules: (
    options: Browser.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
}

export interface PdfHandlerRegistrationDependencies {
  dnr: PdfDeclarativeNetRequestApi;
  getMimeHandlerApi: () => BrowserMimeHandlerApi | undefined;
  getSettings: () => Promise<{ openPdfInYuel: boolean }>;
  getViewerUrl: () => string;
}

export function initializePdfHandler(): void {
  void syncDefaultPdfHandlerRegistration();

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !(PDF_HANDLER_SETTINGS_KEY in changes)) return;
    void syncDefaultPdfHandlerRegistration();
  });
}

export function syncDefaultPdfHandlerRegistration(): Promise<void> {
  const synchronization = defaultPdfHandlerSyncQueue.then(
    runDefaultPdfHandlerSynchronization,
    runDefaultPdfHandlerSynchronization,
  );
  defaultPdfHandlerSyncQueue = synchronization;
  return synchronization;
}

async function runDefaultPdfHandlerSynchronization(): Promise<void> {
  try {
    await syncPdfHandlerRegistration({
      dnr: browser.declarativeNetRequest,
      getMimeHandlerApi: getBrowserMimeHandlerApi,
      getSettings: () => getPdfHandlerSettings(
        browser.storage.local as unknown as PdfHandlerSettingsStore,
      ),
      getViewerUrl: () => browser.runtime.getURL(PDF_READER_PATH),
    });
  } catch (error) {
    console.error('Failed to synchronize the Yuel PDF handler', error);
  }
}

export async function syncPdfHandlerRegistration(
  dependencies: PdfHandlerRegistrationDependencies,
): Promise<'native' | 'dnr' | 'disabled' | 'unsupported'> {
  const settings = await dependencies.getSettings();
  const mimeHandler = dependencies.getMimeHandlerApi();

  if (mimeHandler) {
    await removePdfRedirectRules(dependencies.dnr);
    const currentOptions = await mimeHandler.getMimeHandlerOptions(PDF_MIME_TYPE);
    if (currentOptions.enabled !== settings.openPdfInYuel) {
      await mimeHandler.setMimeHandlerOptions(
        PDF_MIME_TYPE,
        { enabled: settings.openPdfInYuel },
      );
    }
    return settings.openPdfInYuel ? 'native' : 'disabled';
  }

  if (!settings.openPdfInYuel) {
    await removePdfRedirectRules(dependencies.dnr);
    return 'disabled';
  }

  if (!(await supportsPdfResponseHeaderRules(dependencies.dnr))) {
    await removePdfRedirectRules(dependencies.dnr);
    return 'unsupported';
  }

  await dependencies.dnr.updateDynamicRules({
    removeRuleIds: [...PDF_REDIRECT_RULE_IDS],
    addRules: createPdfRedirectRules(dependencies.getViewerUrl()),
  });
  return 'dnr';
}

export function createPdfRedirectRules(
  viewerUrl: string,
): Browser.declarativeNetRequest.Rule[] {
  const redirect = {
    type: 'redirect',
    redirect: {
      regexSubstitution: `${viewerUrl}?DNR:\\0`,
    },
  } satisfies Browser.declarativeNetRequest.RuleAction;

  return [
    {
      id: PDF_REDIRECT_RULE_IDS[0],
      priority: 3,
      action: { type: 'allow' },
      condition: {
        regexFilter: '^https?://.*$',
        requestMethods: ['get'],
        resourceTypes: ['main_frame'],
        responseHeaders: [{
          header: 'content-disposition',
          values: ['attachment*'],
        }],
      },
    },
    {
      id: PDF_REDIRECT_RULE_IDS[1],
      priority: 2,
      action: redirect,
      condition: {
        regexFilter: '^https?://.*$',
        requestMethods: ['get'],
        resourceTypes: ['main_frame'],
        responseHeaders: [{
          header: 'content-type',
          values: ['application/pdf', 'application/pdf;*'],
        }],
      },
    },
    {
      id: PDF_REDIRECT_RULE_IDS[2],
      priority: 1,
      action: redirect,
      condition: {
        regexFilter: '^https?://[^?#]+\\.pdf(\\?[^#]*)?$',
        requestMethods: ['get'],
        resourceTypes: ['main_frame'],
        responseHeaders: [{
          header: 'content-type',
          values: ['application/octet-stream', 'application/octet-stream;*'],
        }],
      },
    },
  ];
}

export async function supportsPdfResponseHeaderRules(
  dnr: PdfDeclarativeNetRequestApi,
): Promise<boolean> {
  try {
    await dnr.updateSessionRules({
      removeRuleIds: [PDF_HEADER_PROBE_RULE_ID],
      addRules: [{
        id: PDF_HEADER_PROBE_RULE_ID,
        action: { type: 'block' },
        condition: {
          urlFilter: '|yuel-pdf-header-probe.invalid',
          responseHeaders: [{ header: 'x-yuel-pdf-probe' }],
        },
      }],
    });
  } catch {
    return false;
  }

  try {
    await dnr.updateSessionRules({
      removeRuleIds: [PDF_HEADER_PROBE_RULE_ID],
      addRules: [{
        id: PDF_HEADER_PROBE_RULE_ID,
        action: { type: 'block' },
        condition: {
          urlFilter: '|yuel-pdf-header-probe.invalid',
          responseHeaders: [],
        },
      }],
    });
    return false;
  } catch {
    return true;
  } finally {
    await dnr.updateSessionRules({
      removeRuleIds: [PDF_HEADER_PROBE_RULE_ID],
    }).catch(() => undefined);
  }
}

async function removePdfRedirectRules(
  dnr: PdfDeclarativeNetRequestApi,
): Promise<void> {
  await dnr.updateDynamicRules({
    removeRuleIds: [...PDF_REDIRECT_RULE_IDS],
  });
}
