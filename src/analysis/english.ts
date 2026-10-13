export interface EnglishAnalysis {
  language: 'en';
  wordCount: number;
  sentenceCount: number;
  tokens: string[];
}

export interface EnglishTextHeuristicOptions {
  minWords?: number;
}

export const ENGLISH_WORD_PATTERN = /[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g;
const BASIC_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'be', 'for', 'in', 'is', 'of', 'on', 'or', 'the', 'to']);
const ENGLISH_SIGNAL_WORDS = new Set([
  'about',
  'across',
  'after',
  'all',
  'also',
  'and',
  'are',
  'because',
  'been',
  'before',
  'being',
  'between',
  'but',
  'can',
  'could',
  'did',
  'does',
  'during',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'into',
  'its',
  'may',
  'might',
  'must',
  'not',
  'of',
  'on',
  'or',
  'over',
  'should',
  'that',
  'the',
  'these',
  'this',
  'those',
  'through',
  'under',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'without',
  'would',
]);

export function analyzeEnglishText(text: string): EnglishAnalysis {
  const tokens = tokenizeEnglishText(text);

  return {
    language: 'en',
    wordCount: tokens.length,
    sentenceCount: countSentences(text),
    tokens,
  };
}

export function tokenizeEnglishText(text: string): string[] {
  const normalizedText = text.replace(/[‐-‒–—―]/g, ' ');
  return Array.from(normalizedText.matchAll(ENGLISH_WORD_PATTERN), (match) => normalizeToken(match[0])).filter(Boolean);
}

export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^'+|'+$/g, '');
}

export function isTrackableEnglishToken(token: string): boolean {
  return token.length >= 4 && !BASIC_STOP_WORDS.has(token) && !/^\d+$/.test(token);
}

export function isLikelyEnglishText(text: string, { minWords = 8 }: EnglishTextHeuristicOptions = {}): boolean {
  const tokens = tokenizeEnglishText(text);
  if (tokens.length < minWords) {
    return false;
  }

  const latinLetterCount = countPatternMatches(text, /[A-Za-z]/g);
  if (latinLetterCount < 24) {
    return false;
  }

  const cjkCharacterCount = countPatternMatches(text, /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g);
  if (cjkCharacterCount > 0 && latinLetterCount / (latinLetterCount + cjkCharacterCount) < 0.55) {
    return false;
  }

  if (cjkCharacterCount === 0 && tokens.length >= 30) {
    return true;
  }

  const signalWordCount = tokens.filter((token) => ENGLISH_SIGNAL_WORDS.has(token)).length;
  return signalWordCount > 0;
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

function countPatternMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

export function getSentenceSegmenter(): Intl.Segmenter | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') {
    return undefined;
  }

  return new Intl.Segmenter('en', { granularity: 'sentence' });
}
