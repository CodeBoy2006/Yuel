import { describe, expect, it } from 'vitest';

import { createShareCardContent, createShareCardCopyText } from './shareCardContent';

describe('createShareCardContent', () => {
  it('normalizes the visual and copy source data once', () => {
    const content = createShareCardContent({
      date: '2026-06-27',
      effectiveWords: 1_280,
      minutes: 8.5,
      advancedWords: 0,
      expressions: 0,
      streak: 3,
      topDomains: ['developer.mozilla.org', 'web.dev', 'developer.mozilla.org', 'react.dev'],
      readPages: 4,
      learningWords: 11,
      hasData: true,
    });

    expect(content).toMatchObject({
      date: '2026-06-27',
      effectiveWords: '1,280',
      readingTime: '9 分钟',
      pages: '4',
      learningWords: '11',
      streak: '3',
      domains: ['developer.mozilla.org', 'web.dev', 'react.dev'],
    });
    expect(createShareCardCopyText(content, { siteLimit: 3, showStreak: true })).toBe(
      '阅量 · 今日英文阅读 · 2026-06-27\n'
      + '今天计入 1,280 Words\n'
      + '连续打卡：3 天\n'
      + '阅读时间：9 分钟\n'
      + '页面：4 页\n'
      + '学习中词汇：11 个\n'
      + '今日网站：developer.mozilla.org、web.dev、react.dev',
    );
  });

  it('keeps copied content aligned with the user-selected card fields', () => {
    const content = createShareCardContent({
      date: '2026-06-27',
      effectiveWords: 900,
      minutes: 10,
      advancedWords: 0,
      expressions: 0,
      streak: 8,
      topDomains: ['developer.mozilla.org', 'web.dev', 'react.dev'],
      readPages: 3,
      learningWords: 4,
      hasData: true,
    });

    expect(createShareCardCopyText(content, { siteLimit: 2, showStreak: false })).toBe(
      '阅量 · 今日英文阅读 · 2026-06-27\n'
      + '今天计入 900 Words\n'
      + '阅读时间：10 分钟\n'
      + '页面：3 页\n'
      + '学习中词汇：4 个\n'
      + '今日网站：developer.mozilla.org、web.dev',
    );
  });
});
