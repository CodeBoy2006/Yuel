import { describe, expect, it } from 'vitest';

import { analyzeEnglishText, isLikelyEnglishText } from './english';

describe('analyzeEnglishText', () => {
  it('normalizes English text into tokens and counts sentence boundaries', () => {
    const result = analyzeEnglishText('Mitigate memory overhead, and fail gracefully when APIs change. Ship backward-compatible defaults.');

    expect(result.wordCount).toBe(13);
    expect(result.sentenceCount).toBe(2);
    expect(result.tokens).toContain('mitigate');
    expect(result.tokens).toContain('apis');
    expect(result.tokens).toContain('backward');
    expect(result.tokens).toContain('compatible');
  });

  it('recognizes readable English text even when it appears on a localized page', () => {
    expect(
      isLikelyEnglishText(
        'Chrome extension tutorials explain how service workers, content scripts, and permissions should work together.',
      ),
    ).toBe(true);
  });

  it('rejects Chinese prose that only contains scattered English technology terms', () => {
    expect(
      isLikelyEnglishText(
        '这篇文章介绍 React Vue Next TypeScript JavaScript API DOM CSS HTML Chrome Extension 的使用场景和常见问题。',
      ),
    ).toBe(false);
  });
});
