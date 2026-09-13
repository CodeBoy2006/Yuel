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

  it.each([
    // Reference URL from page 23 of arXiv:2604.26962; previously looped forever.
    'URL https://proceedings.neurips.cc/paper_files/paper/2023/hash/d842425e4bf79ba039352da0f658a906-Abstrac t-Conference.html.',
    `Short lead. ${Array.from({ length: 60 }, () => 'alpha').join('-')}. Tiny ending.`,
    `The expression is ${'x1+'.repeat(60)}x2.`,
  ])('bounds dense text without losing source text or words: %s', (text) => {
    const chunks = splitTextIntoChunkTexts(text);
    const wordCounts = chunks.map((chunk) => analyzeEnglishText(chunk).wordCount);

    expect(wordCounts.every((count) =>
      count >= MIN_TEXT_CHUNK_WORDS && count <= MAX_TEXT_CHUNK_WORDS)).toBe(true);
    expect(wordCounts.reduce((sum, count) => sum + count, 0)).toBe(
      analyzeEnglishText(text).wordCount,
    );
    let offset = 0;
    for (const chunk of chunks) {
      const start = text.indexOf(chunk, offset);
      expect(start).toBeGreaterThanOrEqual(offset);
      expect(text.slice(offset, start).trim()).toBe('');
      offset = start + chunk.length;
    }
    expect(text.slice(offset).trim()).toBe('');
  });
});
