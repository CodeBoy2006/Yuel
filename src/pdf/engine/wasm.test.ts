import { describe, expect, it } from 'vitest';

import { resolvePdfiumWasmUrl } from './wasm';

describe('resolvePdfiumWasmUrl', () => {
  it('resolves emitted assets against the extension page origin', () => {
    expect(resolvePdfiumWasmUrl(
      '/assets/pdfium-abc123.wasm',
      'chrome-extension://extension-id/pdf-reader.html',
    )).toBe('chrome-extension://extension-id/assets/pdfium-abc123.wasm');
  });

  it('preserves an already absolute asset URL', () => {
    expect(resolvePdfiumWasmUrl(
      'chrome-extension://extension-id/assets/pdfium.wasm',
      'chrome-extension://extension-id/pdf-reader.html',
    )).toBe('chrome-extension://extension-id/assets/pdfium.wasm');
  });

  it('rejects an empty asset URL', () => {
    expect(() => resolvePdfiumWasmUrl('  ', 'chrome-extension://extension-id/pdf-reader.html'))
      .toThrow('must not be empty');
  });
});
