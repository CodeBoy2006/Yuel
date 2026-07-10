import { describe, expect, it } from 'vitest';

import { createShareCardContent } from './shareCardContent';

describe('createShareCardContent', () => {
  it('keeps the visual preview and copied Chinese summary on one content model', () => {
    const content = createShareCardContent({
      date: '2026-06-27',
      effectiveWords: 1_280,
      minutes: 8.5,
      advancedWords: 0,
      expressions: 0,
      streak: 3,
      topDomains: ['developer.mozilla.org'],
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
      domain: 'developer.mozilla.org',
    });
    expect(content.copyText).toBe(
      '阅量 · 今日英文阅读 · 2026-06-27\n'
      + '今天计入 1,280 个英文词\n'
      + '阅读时间：9 分钟\n'
      + '页面：4 页\n'
      + '学习中词汇：11 个\n'
      + '今日网站：developer.mozilla.org',
    );
  });
});
