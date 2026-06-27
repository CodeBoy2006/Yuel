export interface EnglishAnalysis {
  language: 'en';
  wordCount: number;
  sentenceCount: number;
  tokens: string[];
}

const WORD_PATTERN = /[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g;

export function analyzeEnglishText(text: string): EnglishAnalysis {
  const normalizedText = text.replace(/[‐-‒–—―]/g, ' ');
  const tokens = Array.from(normalizedText.matchAll(WORD_PATTERN), (match) => normalizeToken(match[0])).filter(Boolean);

  return {
    language: 'en',
    wordCount: tokens.length,
    sentenceCount: countSentences(text),
    tokens,
  };
}

export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^'+|'+$/g, '');
}

function countSentences(text: string): number {
  const trimmed = text.trim();

  if (!trimmed) {
    return 0;
  }

  const segmenter = getSentenceSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(trimmed)).filter((segment) => segment.segment.trim().length > 0).length;
  }

  return trimmed.split(/[.!?]+/).filter((segment) => segment.trim().length > 0).length;
}

function getSentenceSegmenter(): Intl.Segmenter | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') {
    return undefined;
  }

  return new Intl.Segmenter('en', { granularity: 'sentence' });
}
