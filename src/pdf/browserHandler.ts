export const PDF_MIME_TYPE = 'application/pdf';

export interface BrowserPdfStreamInfo {
  streamUrl: string;
  originalUrl: string;
  mimeType: string;
  embedded: boolean;
}

export interface BrowserMimeHandlerStreamInfo extends BrowserPdfStreamInfo {
  tabId: number;
  responseHeaders: Record<string, string>;
}

export interface BrowserMimeHandlerApi {
  getMimeHandlerOptions: (mimeType: string) => Promise<{ enabled: boolean }>;
  setMimeHandlerOptions: (
    mimeType: string,
    options: { enabled: boolean },
  ) => Promise<void>;
  getStreamInfo: () => Promise<BrowserMimeHandlerStreamInfo>;
  abortAndFallbackToNativeHandler: () => Promise<void>;
}

export function getBrowserMimeHandlerApi(): BrowserMimeHandlerApi | undefined {
  const mimeHandler = (globalThis as typeof globalThis & {
    chrome?: { mimeHandler?: Partial<BrowserMimeHandlerApi> };
  }).chrome?.mimeHandler;

  if (
    !mimeHandler
    || typeof mimeHandler.getMimeHandlerOptions !== 'function'
    || typeof mimeHandler.setMimeHandlerOptions !== 'function'
    || typeof mimeHandler.getStreamInfo !== 'function'
    || typeof mimeHandler.abortAndFallbackToNativeHandler !== 'function'
  ) {
    return undefined;
  }

  return mimeHandler as BrowserMimeHandlerApi;
}

export async function readBrowserPdfStreamInfo(
  api: BrowserMimeHandlerApi | undefined = getBrowserMimeHandlerApi(),
): Promise<BrowserPdfStreamInfo | undefined> {
  if (!api) return undefined;

  try {
    return normalizeBrowserPdfStreamInfo(await api.getStreamInfo());
  } catch {
    // Manual tabs have no stream, so a rejected fallback must leave them usable.
    await fallbackToNativePdfHandler(api).catch(() => undefined);
    return undefined;
  }
}

export async function fallbackToNativePdfHandler(
  api: BrowserMimeHandlerApi | undefined = getBrowserMimeHandlerApi(),
): Promise<void> {
  await api?.abortAndFallbackToNativeHandler();
}

function normalizeBrowserPdfStreamInfo(value: BrowserPdfStreamInfo): BrowserPdfStreamInfo {
  const streamUrl = parseAbsoluteUrl(value.streamUrl, 'PDF stream URL');
  const originalUrl = parseAbsoluteUrl(value.originalUrl, 'original PDF URL');
  const mimeType = value.mimeType.trim().toLowerCase();
  if (mimeType !== PDF_MIME_TYPE) {
    throw new TypeError('Browser MIME handler launch must contain an application/pdf stream.');
  }

  return {
    streamUrl: streamUrl.toString(),
    originalUrl: originalUrl.toString(),
    mimeType,
    embedded: value.embedded === true,
  };
}

function parseAbsoluteUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new TypeError(`Browser MIME handler launch requires a valid ${label}.`);
  }
}
