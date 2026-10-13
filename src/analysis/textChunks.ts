import { ENGLISH_WORD_PATTERN, getSentenceSegmenter } from './english';

export const MIN_TEXT_CHUNK_WORDS = 8;
export const TARGET_MIN_TEXT_CHUNK_WORDS = 16;
export const MAX_TEXT_CHUNK_WORDS = 24;

interface TextChunkUnit {
  text: string;
  wordCount: number;
}

export function splitTextIntoChunkTexts(text: string): string[] {
  const units = splitIntoChunkUnits(normalizeWhitespace(text));
  const chunks: TextChunkUnit[] = [];
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

  rebalanceUndersizedChunks(chunks);

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
    const wordCount = sentence.match(ENGLISH_WORD_PATTERN)?.length ?? 0;
    if (wordCount <= MAX_TEXT_CHUNK_WORDS) {
      return wordCount > 0 ? [{ text: sentence, wordCount }] : [];
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
  // Count and split at the same boundaries: URLs and code can contain many
  // words without spaces, which otherwise leaves rebalancing stuck forever.
  const words = Array.from(text.matchAll(ENGLISH_WORD_PATTERN));
  const desiredChunkCount = Math.max(1, Math.ceil(words.length / MAX_TEXT_CHUNK_WORDS));
  const chunks: TextChunkUnit[] = [];
  let start = 0;

  for (let wordIndex = 0; wordIndex < words.length;) {
    const wordCount = Math.ceil(
      (words.length - wordIndex) / (desiredChunkCount - chunks.length),
    );
    wordIndex += wordCount;
    const end = words[wordIndex]?.index ?? text.length;
    chunks.push({
      text: text.slice(start, end).trim(),
      wordCount,
    });
    start = end;
  }

  return chunks;
}

function rebalanceUndersizedChunks(chunks: TextChunkUnit[]): void {
  let undersizedIndex = chunks.findIndex((chunk) => chunk.wordCount < MIN_TEXT_CHUNK_WORDS);

  while (undersizedIndex >= 0 && chunks.length > 1) {
    const pairStart = undersizedIndex === chunks.length - 1 ? undersizedIndex - 1 : undersizedIndex;
    const combinedText = `${chunks[pairStart].text} ${chunks[pairStart + 1].text}`;
    chunks.splice(pairStart, 2, ...splitTextByBalancedWords(combinedText));
    undersizedIndex = chunks.findIndex((chunk) => chunk.wordCount < MIN_TEXT_CHUNK_WORDS);
  }
}
