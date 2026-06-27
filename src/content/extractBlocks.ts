import { analyzeEnglishText } from '../analysis/english';
import { createChunkId, createPageId, hashText, type PageSnapshot, type TextChunkSnapshot } from '../domain/events';

export interface TextBlockCandidate extends TextChunkSnapshot {
  element: HTMLElement;
}

const TEXT_BLOCK_SELECTOR = [
  'article p',
  'article li',
  'main p',
  'main li',
  'section p',
  'section li',
  '.markdown-body p',
  '.markdown-body li',
  '[class*="docs"] p',
  '[class*="docs"] li',
  'blockquote',
].join(',');

export function summarizeCurrentPage(doc: Document = document): PageSnapshot {
  const blocks = collectTextBlocks(doc);
  const url = doc.location.href;

  return {
    pageId: createPageId(url),
    domain: doc.location.hostname.replace(/^www\./, ''),
    titleHash: hashText(doc.title),
    urlHash: hashText(url),
    language: 'en',
    totalWords: blocks.reduce((sum, block) => sum + block.wordCount, 0),
    capturedAt: Date.now(),
  };
}

export function collectTextBlocks(doc: Document = document): TextBlockCandidate[] {
  const pageId = createPageId(doc.location.href);
  const seen = new Set<string>();

  return Array.from(doc.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR))
    .map((element) => createCandidate(pageId, element))
    .filter((candidate): candidate is TextBlockCandidate => {
      if (!candidate) return false;
      if (candidate.wordCount < 8) return false;
      if (seen.has(candidate.textHash)) return false;
      seen.add(candidate.textHash);
      return true;
    });
}

function createCandidate(pageId: string, element: HTMLElement): TextBlockCandidate | undefined {
  if (!isVisibleElement(element)) {
    return undefined;
  }

  const text = normalizeWhitespace(element.innerText || element.textContent || '');
  if (!text) {
    return undefined;
  }

  const analysis = analyzeEnglishText(text);

  return {
    element,
    chunkId: createChunkId(pageId, text),
    pageId,
    textHash: hashText(text),
    text,
    wordCount: analysis.wordCount,
    sentenceCount: analysis.sentenceCount,
    selector: describeElement(element),
  };
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
