import { PdfErrorCode } from '@embedpdf/models';
import { describe, expect, it } from 'vitest';

import { PdfSourceError } from '../source';
import {
  formatPdfBytes,
  formatPdfOpenError,
  formatPdfSourceProgress,
  isPasswordPdfError,
} from './format';

describe('PDF reader formatting', () => {
  it('formats byte counts and determinate progress compactly', () => {
    expect(formatPdfBytes(1_572_864)).toBe('1.5 MB');
    expect(formatPdfSourceProgress({
      stage: 'reading',
      loadedBytes: 50,
      totalBytes: 100,
    })).toBe('正在读取 · 50%');
  });

  it('explains full-download size limits with measured values', () => {
    expect(formatPdfOpenError(new PdfSourceError('too-large', 'too large', {
      actualBytes: 125_829_120,
      maxBytes: 100_663_296,
    }))).toBe('文件过大：120 MB，当前完整加载上限为 96 MB。');
  });

  it('recognizes password failures nested in EmbedPDF task errors', () => {
    expect(isPasswordPdfError({
      reason: {
        code: PdfErrorCode.Password,
        message: 'Password required',
      },
    })).toBe(true);
    expect(isPasswordPdfError(new Error('other'))).toBe(false);
  });
});
