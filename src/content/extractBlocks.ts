import { analyzeEnglishText } from '../analysis/english';
import { createChunkId, createPageId, hashText, type PageSnapshot, type TextChunkSnapshot } from '../domain/events';

export interface TextBlockCandidate extends TextChunkSnapshot {
  element: HTMLElement;
}

const TEXT_BLOCK_SELECTOR = [
  'article p',
  'article li',
  'article h1',
  'article h2',
  'article h3',
  'article pre',
  'main p',
  'main li',
  'main h1',
  'main h2',
  'main h3',
  'main pre',
  'section p',
  'section li',
  'section h1',
  'section h2',
  'section h3',
  'section pre',
  '.markdown-body p',
  '.markdown-body li',
  '.markdown-body h1',
  '.markdown-body h2',
  '.markdown-body h3',
  '.markdown-body pre',
  '[class*="docs"] p',
  '[class*="docs"] li',
  '[class*="docs"] h1',
  '[class*="docs"] h2',
  '[class*="docs"] h3',
  '[class*="docs"] pre',
  'blockquote',
].join(',');
const FALLBACK_TEXT_BLOCK_SELECTOR = 'body p, body li, body h1, body h2, body h3, body pre, body blockquote';
const MIN_TEXT_CHUNK_WORDS = 8;
const TARGET_MIN_TEXT_CHUNK_WORDS = 30;
const MAX_TEXT_CHUNK_WORDS = 120;
const EXCLUDED_ANCESTOR_SELECTOR = [
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'dialog',
  '[aria-hidden="true"]',
  '[contenteditable]',
  '[hidden]',
  '[inert]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[role="navigation"]',
  '[role="search"]',
  '[role="textbox"]',
].join(',');

export function summarizeCurrentPage(
  doc: Document = document,
  blocks: TextChunkSnapshot[] = collectTextBlocks(doc),
): PageSnapshot {
  const url = doc.location.href;

  return {
    pageId: createPageId(url),
    domain: doc.location.hostname.replace(/^www\./, ''),
    titleHash: hashText(doc.title),
    urlHash: hashText(url),
    language: getDocumentPrimaryLanguage(doc),
    totalWords: blocks.reduce((sum, block) => sum + block.wordCount, 0),
    capturedAt: Date.now(),
  };
}

export function collectTextBlocks(doc: Document = document): TextBlockCandidate[] {
  if (getDocumentPrimaryLanguage(doc) !== 'en') {
    return [];
  }

  const pageId = createPageId(doc.location.href);
  const primaryCandidates = collectCandidates(doc, pageId, TEXT_BLOCK_SELECTOR);

  return primaryCandidates.length > 0 ? primaryCandidates : collectCandidates(doc, pageId, FALLBACK_TEXT_BLOCK_SELECTOR);
}

export function getDocumentPrimaryLanguage(doc: Document = document): string {
  return normalizePageLanguage(doc.documentElement.lang);
}

function collectCandidates(doc: Document, pageId: string, selector: string): TextBlockCandidate[] {
  const seen = new Set<string>();

  return Array.from(doc.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !hasExcludedAncestor(element) && !hasNonEnglishLanguageDeclaration(element))
    .flatMap((element) => createCandidates(pageId, element))
    .filter((candidate) => {
      if (seen.has(candidate.textHash)) return false;
      seen.add(candidate.textHash);
      return true;
    });
}

function hasExcludedAncestor(element: HTMLElement): boolean {
  return Boolean(element.closest(EXCLUDED_ANCESTOR_SELECTOR));
}

function hasNonEnglishLanguageDeclaration(element: HTMLElement): boolean {
  const declaredLanguageOwner = element.closest<HTMLElement>('[lang]');
  return Boolean(declaredLanguageOwner && normalizePageLanguage(declaredLanguageOwner.lang) !== 'en');
}

function createCandidates(pageId: string, element: HTMLElement): TextBlockCandidate[] {
  if (!isVisibleElement(element)) {
    return [];
  }

  const text = normalizeWhitespace(element.innerText || element.textContent || '');
  if (!text) {
    return [];
  }

  const textAnalysis = analyzeEnglishText(text);
  if (textAnalysis.wordCount < MIN_TEXT_CHUNK_WORDS) {
    return [];
  }

  const selector = describeElement(element);
  const textChunks = splitTextIntoChunkTexts(text);

  return textChunks.map((chunkText, index) => {
    const analysis = analyzeEnglishText(chunkText);
    return {
      element,
      chunkId: createChunkId(pageId, chunkText),
      pageId,
      textHash: hashText(chunkText),
      text: chunkText,
      wordCount: analysis.wordCount,
      sentenceCount: analysis.sentenceCount,
      selector: textChunks.length === 1 ? selector : `${selector}::chunk(${index + 1})`,
    };
  });
}

interface TextChunkUnit {
  text: string;
  wordCount: number;
}

function splitTextIntoChunkTexts(text: string): string[] {
  const units = splitIntoChunkUnits(text);
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

function splitIntoChunkUnits(text: string): TextChunkUnit[] {
  return splitIntoSentenceTexts(text).flatMap((sentence) => {
    const analysis = analyzeEnglishText(sentence);
    if (analysis.wordCount <= MAX_TEXT_CHUNK_WORDS) {
      return analysis.wordCount > 0 ? [{ text: sentence, wordCount: analysis.wordCount }] : [];
    }

    return splitOversizedSentence(sentence);
  });
}

function splitIntoSentenceTexts(text: string): string[] {
  const segmenter = getSentenceSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(text), (segment) => normalizeWhitespace(segment.segment)).filter(Boolean);
  }

  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]).map(normalizeWhitespace).filter(Boolean);
}

function splitOversizedSentence(sentence: string): TextChunkUnit[] {
  const parts = sentence.split(/\s+/).filter(Boolean);
  const chunks: TextChunkUnit[] = [];
  let currentParts: string[] = [];
  let currentWordCount = 0;

  for (const part of parts) {
    const wordCount = analyzeEnglishText(part).wordCount;
    if (wordCount === 0) {
      currentParts.push(part);
      continue;
    }

    if (currentWordCount > 0 && currentWordCount + wordCount > MAX_TEXT_CHUNK_WORDS) {
      chunks.push({
        text: currentParts.join(' '),
        wordCount: currentWordCount,
      });
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

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);

  return rect.width > 0 && rect.height > 0 && styles.visibility !== 'hidden' && styles.display !== 'none';
}

function describeElement(element: HTMLElement): string {
  if (element.id) {
    return `${element.tagName.toLowerCase()}#${element.id}`;
  }

  const className = Array.from(element.classList).slice(0, 2).join('.');
  return className ? `${element.tagName.toLowerCase()}.${className}` : element.tagName.toLowerCase();
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function getSentenceSegmenter(): Intl.Segmenter | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') {
    return undefined;
  }

  return new Intl.Segmenter('en', { granularity: 'sentence' });
}

function normalizePageLanguage(language: string): string {
  const primaryLanguage = language.trim().toLowerCase().split(/[-_]/)[0];
  return primaryLanguage || 'en';
}
