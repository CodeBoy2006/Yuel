import { describe, expect, it } from 'vitest';

import { analyzeEnglishText } from './english';

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
});
