import { analyzeEnglishText, isLikelyEnglishText } from '../analysis/english';
import {
  MIN_TEXT_CHUNK_WORDS,
  normalizeWhitespace,
  splitTextIntoChunkTexts,
} from '../analysis/textChunks';
import { createChunkId, createPageId, hashText, type PageSnapshot, type TextChunkSnapshot } from '../domain/events';
import { READING_METRIC_MODEL_VERSION } from '../domain/metrics';

export interface TextBlockCandidate extends TextChunkSnapshot {
  element: HTMLElement;
  chunkIndex: number;
  chunkCount: number;
  textRange?: Range;
}

interface TextPosition {
  node: Text;
  offset: number;
}

interface NormalizedTextMap {
  text: string;
  starts: Array<TextPosition | undefined>;
  ends: Array<TextPosition | undefined>;
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
    language: blocks.length > 0 ? 'en' : getDocumentPrimaryLanguage(doc),
    totalWords: blocks.reduce((sum, block) => sum + block.wordCount, 0),
    metricModelVersion: READING_METRIC_MODEL_VERSION,
    capturedAt: Date.now(),
  };
}

export function collectTextBlocks(doc: Document = document): TextBlockCandidate[] {
  const pageId = createPageId(doc.location.href);
  const primaryCandidates = collectCandidates(doc, pageId, TEXT_BLOCK_SELECTOR);

  return primaryCandidates.length > 0 ? primaryCandidates : collectCandidates(doc, pageId, FALLBACK_TEXT_BLOCK_SELECTOR);
}

export function getDocumentPrimaryLanguage(doc: Document = document): string {
  return isLikelyEnglishText(collectDocumentLanguageSample(doc), { minWords: MIN_TEXT_CHUNK_WORDS }) ? 'en' : 'unknown';
}

function collectCandidates(doc: Document, pageId: string, selector: string): TextBlockCandidate[] {
  const sourceOccurrences = new Map<string, number>();
  const collectedElements = new Set<HTMLElement>();

  return Array.from(doc.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !hasExcludedAncestor(element))
    .flatMap((element) => {
      // An accepted ancestor already contains this text, including any surrounding prose.
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (collectedElements.has(ancestor)) return [];
      }
      const sourceFingerprint = createSourceFingerprint(element);
      const sourceOccurrence = (sourceOccurrences.get(sourceFingerprint) ?? 0) + 1;
      const candidates = createCandidates(pageId, element, sourceFingerprint, sourceOccurrence);
      if (candidates.length > 0) {
        collectedElements.add(element);
        sourceOccurrences.set(sourceFingerprint, sourceOccurrence);
      }
      return candidates;
    });
}

function hasExcludedAncestor(element: HTMLElement): boolean {
  return Boolean(element.closest(EXCLUDED_ANCESTOR_SELECTOR));
}

function createCandidates(
  pageId: string,
  element: HTMLElement,
  sourceFingerprint: string,
  sourceOccurrence: number,
): TextBlockCandidate[] {
  if (!isVisibleElement(element)) {
    return [];
  }

  const text = normalizeWhitespace(element.innerText || element.textContent || '');
  if (!text) {
    return [];
  }

  if (!isLikelyEnglishText(text, { minWords: MIN_TEXT_CHUNK_WORDS })) {
    return [];
  }

  const textAnalysis = analyzeEnglishText(text);
  if (textAnalysis.wordCount < MIN_TEXT_CHUNK_WORDS) {
    return [];
  }

  const selector = describeElement(element);
  const textChunks = splitTextIntoChunkTexts(text);
  const textRanges = createChunkTextRanges(element, textChunks);

  return textChunks.map((chunkText, index) => {
    const analysis = analyzeEnglishText(chunkText);
    const chunkSelector = textChunks.length === 1 ? selector : `${selector}::chunk(${index + 1})`;
    const sourceKey = `source(${sourceFingerprint}:${sourceOccurrence})::segment(${index + 1})`;
    return {
      element,
      chunkIndex: index,
      chunkCount: textChunks.length,
      textRange: textRanges[index],
      chunkId: createChunkId(pageId, chunkText, sourceKey),
      pageId,
      textHash: hashText(chunkText),
      text: chunkText,
      sourceKey,
      wordCount: analysis.wordCount,
      sentenceCount: analysis.sentenceCount,
      selector: chunkSelector,
    };
  });
}

function createSourceFingerprint(element: HTMLElement): string {
  const normalizedText = normalizeWhitespace(element.innerText || element.textContent || '');
  const stableIdentity = element.id ? `id:${element.id}` : `text:${normalizedText}`;
  return hashText(stableIdentity);
}

function createChunkTextRanges(element: HTMLElement, textChunks: string[]): Array<Range | undefined> {
  const normalizedTextMap = createNormalizedTextMap(element);
  let searchFrom = 0;

  return textChunks.map((chunkText) => {
    const startIndex = normalizedTextMap.text.indexOf(chunkText, searchFrom);
    if (startIndex < 0) {
      return undefined;
    }

    const endIndex = startIndex + chunkText.length;
    searchFrom = endIndex;
    const start = findRangeStart(normalizedTextMap.starts, startIndex);
    const end = findRangeEnd(normalizedTextMap.ends, endIndex);
    if (!start || !end) {
      return undefined;
    }

    try {
      const range = element.ownerDocument.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return range;
    } catch {
      return undefined;
    }
  });
}

function createNormalizedTextMap(element: HTMLElement): NormalizedTextMap {
  const textNodes = collectTextNodes(element);
  const starts: Array<TextPosition | undefined> = [];
  const ends: Array<TextPosition | undefined> = [];
  let text = '';

  for (const node of textNodes) {
    const nodeText = node.data;
    const wordPattern = /\S+/g;
    let match: RegExpExecArray | null;

    while ((match = wordPattern.exec(nodeText))) {
      if (text.length > 0) {
        text += ' ';
      }

      const word = match[0];
      for (let index = 0; index < word.length; index += 1) {
        const normalizedIndex = text.length;
        const sourceOffset = match.index + index;
        starts[normalizedIndex] = { node, offset: sourceOffset };
        text += word[index];
        ends[text.length] = { node, offset: sourceOffset + 1 };
      }
    }
  }

  return { text, starts, ends };
}

function collectTextNodes(element: HTMLElement): Text[] {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const nodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  return nodes;
}

function findRangeStart(positions: Array<TextPosition | undefined>, index: number): TextPosition | undefined {
  for (let candidateIndex = index; candidateIndex < positions.length; candidateIndex += 1) {
    const position = positions[candidateIndex];
    if (position) {
      return position;
    }
  }

  return undefined;
}

function findRangeEnd(positions: Array<TextPosition | undefined>, index: number): TextPosition | undefined {
  for (let candidateIndex = index; candidateIndex >= 0; candidateIndex -= 1) {
    const position = positions[candidateIndex];
    if (position) {
      return position;
    }
  }

  return undefined;
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

function collectDocumentLanguageSample(doc: Document): string {
  const seen = new Set<HTMLElement>();
  const samples: string[] = [];
  let sampledCharacters = 0;

  for (const selector of [TEXT_BLOCK_SELECTOR, FALLBACK_TEXT_BLOCK_SELECTOR]) {
    for (const element of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
      if (seen.has(element) || hasExcludedAncestor(element) || isElementStyleHidden(element)) {
        continue;
      }

      seen.add(element);
      const text = normalizeWhitespace(element.innerText || element.textContent || '');
      if (!text) {
        continue;
      }

      samples.push(text);
      sampledCharacters += text.length;
      if (sampledCharacters >= 6_000) {
        return samples.join(' ');
      }
    }
  }

  return samples.join(' ');
}

function isElementStyleHidden(element: HTMLElement): boolean {
  const styles = window.getComputedStyle(element);
  return styles.visibility === 'hidden' || styles.display === 'none';
}
