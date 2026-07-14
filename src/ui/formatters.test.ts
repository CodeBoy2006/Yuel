import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatDateTime,
  formatMinutes,
  formatVocabularyExposureCount,
  formatVocabularyStatus,
  formatWords,
} from './formatters';

describe('Chinese UI formatters', () => {
  it('rounds and groups measured counts', () => {
    expect(formatCount(1_280.4)).toBe('1,280');
    expect(formatCount(1_280.5)).toBe('1,281');
    expect(formatWords(1_280.4)).toBe('1,280 词');
  });

  it('rounds fractional vocabulary exposure counts upward', () => {
    expect(formatVocabularyExposureCount(0)).toBe('0');
    expect(formatVocabularyExposureCount(0.2)).toBe('1');
    expect(formatVocabularyExposureCount(1.2)).toBe('2');
  });

  it('keeps the existing minute wording around the one-minute boundary', () => {
    expect(formatMinutes(0)).toBe('0 分钟');
    expect(formatMinutes(0.5)).toBe('不足 1 分钟');
    expect(formatMinutes(1.49)).toBe('1 分钟');
    expect(formatMinutes(1.5)).toBe('2 分钟');
    expect(formatMinutes(60)).toBe('1 小时');
    expect(formatMinutes(75)).toBe('1 小时 15 分钟');
    expect(formatMinutes(120)).toBe('2 小时');
  });

  it('formats dates with a stable Simplified Chinese locale', () => {
    const timestamp = new Date(2026, 5, 27, 10, 5).getTime();

    expect(formatDateTime(timestamp)).toBe('6月27日 10:05');
  });

  it.each([
    ['new', '新词'],
    ['learning', '学习中'],
    ['known', '已掌握'],
    ['ignored', '已忽略'],
  ] as const)('formats the %s vocabulary status', (status, expected) => {
    expect(formatVocabularyStatus(status)).toBe(expected);
  });
});
