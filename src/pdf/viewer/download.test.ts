import { describe, expect, it, vi } from 'vitest';

import {
  downloadPdfBuffer,
  normalizePdfDownloadFileName,
  PDF_DOWNLOAD_MIME_TYPE,
} from './download';

describe('PDF downloads', () => {
  it('preserves PDF names and adds the extension when it is missing', () => {
    expect(normalizePdfDownloadFileName('Guide.pdf')).toBe('Guide.pdf');
    expect(normalizePdfDownloadFileName('Guide.PDF')).toBe('Guide.PDF');
    expect(normalizePdfDownloadFileName('/private/Guide')).toBe('Guide.pdf');
    expect(normalizePdfDownloadFileName('Remote PDF')).toBe('Remote PDF.pdf');
    expect(normalizePdfDownloadFileName(' . ')).toBe('document.pdf');
    expect(normalizePdfDownloadFileName(undefined)).toBe('document.pdf');
  });

  it('downloads a typed PDF file and releases its object URL', () => {
    const link = document.createElement('a');
    const click = vi.spyOn(link, 'click').mockImplementation(() => undefined);
    const createObjectUrl = vi.fn(() => 'blob:yuel-pdf');
    const revokeObjectUrl = vi.fn();
    const scheduleRevoke = vi.fn((callback: () => void) => callback());
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;

    const file = downloadPdfBuffer(buffer, 'download', {
      createLink: () => link,
      createObjectUrl,
      revokeObjectUrl,
      scheduleRevoke,
    });

    expect(file.name).toBe('download.pdf');
    expect(file.type).toBe(PDF_DOWNLOAD_MIME_TYPE);
    expect(file.size).toBe(buffer.byteLength);
    expect(createObjectUrl).toHaveBeenCalledWith(file);
    expect(link.download).toBe('download.pdf');
    expect(link.href).toBe('blob:yuel-pdf');
    expect(link.rel).toBe('noopener');
    expect(click).toHaveBeenCalledOnce();
    expect(scheduleRevoke).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:yuel-pdf');
  });
});
