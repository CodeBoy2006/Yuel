import { describe, expect, it, vi } from 'vitest';

import {
  fallbackToNativePdfHandler,
  readBrowserPdfStreamInfo,
  type BrowserMimeHandlerApi,
} from './browserHandler';

function createApi(
  getStreamInfo: BrowserMimeHandlerApi['getStreamInfo'],
): BrowserMimeHandlerApi {
  return {
    getMimeHandlerOptions: async () => ({ enabled: true }),
    setMimeHandlerOptions: async () => undefined,
    getStreamInfo,
    abortAndFallbackToNativeHandler: async () => undefined,
  };
}

describe('browser PDF MIME handler adapter', () => {
  it('normalizes a valid Chrome PDF stream launch', async () => {
    await expect(readBrowserPdfStreamInfo(createApi(async () => ({
      streamUrl: 'chrome-extension://stream-provider/pdf/1',
      originalUrl: 'https://example.com/books/guide.pdf?token=one',
      mimeType: ' Application/PDF ',
      embedded: false,
      tabId: 42,
      responseHeaders: {
        'content-type': 'application/pdf',
      },
    })))).resolves.toEqual({
      streamUrl: 'chrome-extension://stream-provider/pdf/1',
      originalUrl: 'https://example.com/books/guide.pdf?token=one',
      mimeType: 'application/pdf',
      embedded: false,
    });
  });

  it('attempts native fallback when stream acquisition fails', async () => {
    const api = createApi(async () => { throw new Error('stream unavailable'); });
    const fallback = vi.spyOn(api, 'abortAndFallbackToNativeHandler');

    await expect(readBrowserPdfStreamInfo(api)).resolves.toBeUndefined();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('returns malformed stream metadata to the native handler', async () => {
    const api = createApi(async () => ({
      streamUrl: 'not a URL',
      originalUrl: 'https://example.com/document.pdf',
      mimeType: 'application/pdf',
      embedded: false,
      tabId: 42,
      responseHeaders: {},
    }));
    const fallback = vi.spyOn(api, 'abortAndFallbackToNativeHandler');

    await expect(readBrowserPdfStreamInfo(api)).resolves.toBeUndefined();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('keeps a manual reader usable when there is no stream and native fallback rejects', async () => {
    const api = createApi(async () => { throw new Error('not a MIME handler frame'); });
    vi.spyOn(api, 'abortAndFallbackToNativeHandler').mockRejectedValue(new Error('no associated stream'));

    await expect(readBrowserPdfStreamInfo(api)).resolves.toBeUndefined();
  });

  it('returns a failed native render to Chrome', async () => {
    const abortAndFallbackToNativeHandler = vi.fn(async () => undefined);
    const api = {
      ...createApi(async () => {
        throw new Error('unused');
      }),
      abortAndFallbackToNativeHandler,
    };

    await fallbackToNativePdfHandler(api);

    expect(abortAndFallbackToNativeHandler).toHaveBeenCalledOnce();
  });
});
