import { analyzeEnglishText } from './english';

export const MIN_TEXT_CHUNK_WORDS = 8;
export const TARGET_MIN_TEXT_CHUNK_WORDS = 16;
export const MAX_TEXT_CHUNK_WORDS = 24;

interface TextChunkUnit {
  text: string;
  wordCount: number;
}

export function splitTextIntoChunkTexts(text: string): string[] {
  const units = splitIntoChunkUnits(normalizeWhitespace(text));
  let chunks: TextChunkUnit[] = [];
  let currentTexts: string[] = [];
  let currentWordCount = 0;

  for (const unit of units) {
    if (currentWordCount > 0 && currentWordCount + unit.wordCount > MAX_TEXT_CHUNK_WORDS) {
      chunks.push({
        text: currentTexts.join(' '),
        wordCount: currentWordCount,
      });
      currentTexts = [unit.text];
      currentWordCount = unit.wordCount;
      continue;
    }

    currentTexts.push(unit.text);
    currentWordCount += unit.wordCount;
  }

  if (currentWordCount > 0) {
    chunks.push({
      text: currentTexts.join(' '),
      wordCount: currentWordCount,
    });
  }

  chunks = rebalanceUndersizedChunks(chunks);

  const lastChunk = chunks.at(-1);
  const previousChunk = chunks.at(-2);
  if (
    chunks.length > 1 &&
    lastChunk &&
    previousChunk &&
    lastChunk.wordCount < TARGET_MIN_TEXT_CHUNK_WORDS &&
    previousChunk.wordCount + lastChunk.wordCount <= MAX_TEXT_CHUNK_WORDS
  ) {
    previousChunk.text = `${previousChunk.text} ${lastChunk.text}`;
    previousChunk.wordCount += lastChunk.wordCount;
    chunks.pop();
  }

  return chunks.map((chunk) => chunk.text);
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function splitIntoChunkUnits(text: string): TextChunkUnit[] {
  return splitIntoSentenceTexts(text).flatMap((sentence) => {
    const analysis = analyzeEnglishText(sentence);
    if (analysis.wordCount <= MAX_TEXT_CHUNK_WORDS) {
      return analysis.wordCount > 0 ? [{ text: sentence, wordCount: analysis.wordCount }] : [];
    }

    return splitTextByBalancedWords(sentence);
  });
}

function splitIntoSentenceTexts(text: string): string[] {
  const segmenter = getSentenceSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(text), (segment) => normalizeWhitespace(segment.segment)).filter(Boolean);
  }

  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]).map(normalizeWhitespace).filter(Boolean);
}

function splitTextByBalancedWords(text: string): TextChunkUnit[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const totalWordCount = analyzeEnglishText(text).wordCount;
  const desiredChunkCount = Math.max(1, Math.ceil(totalWordCount / MAX_TEXT_CHUNK_WORDS));
  const chunks: TextChunkUnit[] = [];
  let currentParts: string[] = [];
  let currentWordCount = 0;
  let remainingWordCount = totalWordCount;
  let remainingChunkCount = desiredChunkCount;

  for (const part of parts) {
    const wordCount = analyzeEnglishText(part).wordCount;
    if (wordCount === 0) {
      currentParts.push(part);
      continue;
    }

    const targetWordCount = Math.ceil(remainingWordCount / Math.max(1, remainingChunkCount));
    if (
      currentWordCount > 0 &&
      currentWordCount + wordCount > targetWordCount &&
      chunks.length < desiredChunkCount - 1
    ) {
      chunks.push({
        text: currentParts.join(' '),
        wordCount: currentWordCount,
      });
      remainingWordCount -= currentWordCount;
      remainingChunkCount -= 1;
      currentParts = [part];
      currentWordCount = wordCount;
      continue;
    }

    currentParts.push(part);
    currentWordCount += wordCount;
  }

  if (currentWordCount > 0) {
    chunks.push({
      text: currentParts.join(' '),
      wordCount: currentWordCount,
    });
  }

  return chunks;
}

function rebalanceUndersizedChunks(chunks: TextChunkUnit[]): TextChunkUnit[] {
  const rebalanced = chunks.map((chunk) => ({ ...chunk }));
  let undersizedIndex = rebalanced.findIndex((chunk) => chunk.wordCount < MIN_TEXT_CHUNK_WORDS);

  while (undersizedIndex >= 0 && rebalanced.length > 1) {
    const pairStart = undersizedIndex === rebalanced.length - 1 ? undersizedIndex - 1 : undersizedIndex;
    const combinedText = `${rebalanced[pairStart].text} ${rebalanced[pairStart + 1].text}`;
    rebalanced.splice(pairStart, 2, ...splitTextByBalancedWords(combinedText));
    undersizedIndex = rebalanced.findIndex((chunk) => chunk.wordCount < MIN_TEXT_CHUNK_WORDS);
  }

  return rebalanced;
}

function getSentenceSegmenter(): Intl.Segmenter | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') {
    return undefined;
  }

  return new Intl.Segmenter('en', { granularity: 'sentence' });
}
