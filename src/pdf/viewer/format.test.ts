import { describe, expect, it } from 'vitest';

import { PdfSourceError } from '../source';
import {
  formatPdfBytes,
  formatPdfOpenError,
  formatPdfSourceProgress,
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

  it.each([
    [{ reason: { message: 'Task failed' }, message: 'Outer failure' }, 'Task failed'],
    [new Error('Open failed'), 'Open failed'],
    [Object.assign(new Error('Open failed'), { reason: { message: '' } }), 'Open failed'],
    [{ reason: { message: 42 }, message: 'Outer failure' }, '无法打开 PDF，请重试或选择其他文件。'],
    [null, '无法打开 PDF，请重试或选择其他文件。'],
  ])('preserves task and ordinary error messages for %j', (error, expected) => {
    expect(formatPdfOpenError(error)).toBe(expected);
  });
});
