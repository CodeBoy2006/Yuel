import { describe, expect, it } from 'vitest';

import { analyzeEnglishText } from './english';
import {
  MAX_TEXT_CHUNK_WORDS,
  MIN_TEXT_CHUNK_WORDS,
  normalizeWhitespace,
  splitTextIntoChunkTexts,
} from './textChunks';

describe('splitTextIntoChunkTexts', () => {
  it('normalizes source whitespace before returning chunks', () => {
    const text = 'Stable   reading\nsegments preserve\tmeaning across renderer boundaries.';

    expect(normalizeWhitespace(text)).toBe(
      'Stable reading segments preserve meaning across renderer boundaries.',
    );
    expect(splitTextIntoChunkTexts(text)).toEqual([
      'Stable reading segments preserve meaning across renderer boundaries.',
    ]);
  });

  it('keeps sentence text in order while bounding every chunk', () => {
    const text = Array.from(
      { length: 8 },
      (_, index) => `Sentence ${index + 1} explains stable local analytics across PDF page boundaries.`,
    ).join(' ');
    const chunks = splitTextIntoChunkTexts(text);

    expect(chunks.join(' ')).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => {
      const wordCount = analyzeEnglishText(chunk).wordCount;
      return wordCount >= MIN_TEXT_CHUNK_WORDS && wordCount <= MAX_TEXT_CHUNK_WORDS;
    })).toBe(true);
  });

  it('balances a sentence that exceeds the maximum chunk size', () => {
    const text = `${Array.from({ length: 53 }, () => 'alpha').join(' ')}.`;
    const chunks = splitTextIntoChunkTexts(text);

    expect(chunks.join(' ')).toBe(text);
    expect(chunks.map((chunk) => analyzeEnglishText(chunk).wordCount)).toEqual([18, 18, 17]);
  });

  it('rebalances a short trailing sentence without dropping text', () => {
    const lead = `${Array.from({ length: 48 }, () => 'alpha').join(' ')}.`;
    const trailing = 'Tiny ending remains intact.';
    const text = `${lead} ${trailing}`;
    const chunks = splitTextIntoChunkTexts(text);

    expect(chunks.join(' ')).toBe(text);
    expect(chunks.every((chunk) => {
      const wordCount = analyzeEnglishText(chunk).wordCount;
      return wordCount >= MIN_TEXT_CHUNK_WORDS && wordCount <= MAX_TEXT_CHUNK_WORDS;
    })).toBe(true);
  });
});
