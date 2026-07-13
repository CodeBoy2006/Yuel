import {
  stripPdfUnwantedMarkers,
  transformRect,
} from '@embedpdf/models';
import type {
  PdfPageObject,
  PdfPageTextRuns,
  PdfTextRun,
  Rect,
  Rotation,
  Size,
} from '@embedpdf/models';

import {
  analyzeEnglishText,
  isLikelyEnglishText,
} from '../../analysis/english';
import {
  MIN_TEXT_CHUNK_WORDS,
  normalizeWhitespace,
  splitTextIntoChunkTexts,
} from '../../analysis/textChunks';
import {
  createChunkId,
  hashText,
} from '../../domain/events';
import { createPdfReadingSectionId } from './identity';
import type {
  CreatePdfReadingTextSectionInput,
  PdfReadingTextChunk,
  PdfReadingTextSection,
} from './types';

interface NormalizedRunSegment {
  start: number;
  end: number;
  text: string;
  rect?: Rect;
}

interface NormalizedPageText {
  text: string;
  segments: NormalizedRunSegment[];
}

export function createPdfReadingTextSection({
  metadata,
  pageId,
  page,
  textRuns,
}: CreatePdfReadingTextSectionInput): PdfReadingTextSection {
  const sectionId = createPdfReadingSectionId(metadata.resourceId, page);
  const normalizedPage = createNormalizedPageText(textRuns, page.size);
  const textChunks = splitTextIntoChunkTexts(normalizedPage.text);
  const chunks: PdfReadingTextChunk[] = [];
  let searchFrom = 0;

  for (let index = 0; index < textChunks.length; index += 1) {
    const chunkText = textChunks[index];
    const analysis = analyzeEnglishText(chunkText);
    const start = normalizedPage.text.indexOf(chunkText, searchFrom);
    const safeStart = start >= 0 ? start : searchFrom;
    const end = safeStart + chunkText.length;
    searchFrom = end;

    if (
      analysis.wordCount < MIN_TEXT_CHUNK_WORDS
      || !isLikelyEnglishText(chunkText, { minWords: MIN_TEXT_CHUNK_WORDS })
    ) {
      continue;
    }

    const sourceKey = `section(${sectionId})::segment(${index + 1})`;
    chunks.push({
      chunkId: createChunkId(pageId, chunkText, sourceKey),
      pageId,
      sectionId,
      pageIndex: page.index,
      pageNumber: page.index + 1,
      textHash: hashText(chunkText),
      text: chunkText,
      sourceKey,
      wordCount: analysis.wordCount,
      sentenceCount: analysis.sentenceCount,
      selector: `pdf-page(${page.index + 1})::segment(${index + 1})`,
      rects: createChunkRects(normalizedPage.segments, safeStart, end),
    });
  }

  return {
    sectionId,
    pageIndex: page.index,
    pageNumber: page.index + 1,
    objectNumber: page.objectNumber,
    size: { ...page.size },
    rotation: page.rotation,
    wordCount: chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0),
    chunks,
  };
}

export function combinePdfRotations(
  pageRotation: Rotation,
  documentRotation: Rotation,
): Rotation {
  return ((pageRotation + documentRotation) % 4) as Rotation;
}

export function projectPdfReadingChunkRects(
  chunk: Pick<PdfReadingTextChunk, 'rects'>,
  page: Pick<PdfPageObject, 'size' | 'rotation'>,
  documentRotation: Rotation,
  scale: number,
): Rect[] {
  const rotation = combinePdfRotations(page.rotation, documentRotation);
  return chunk.rects.map((rect) => transformRect(page.size, rect, rotation, scale));
}

function createNormalizedPageText(
  textRuns: PdfPageTextRuns,
  pageSize: Size,
): NormalizedPageText {
  const segments: NormalizedRunSegment[] = [];
  let text = '';
  let previousRun: PdfTextRun | undefined;

  for (const run of textRuns.runs) {
    const normalizedText = normalizeWhitespace(stripPdfUnwantedMarkers(run.text));
    if (!normalizedText) {
      continue;
    }

    const rect = sanitizeRect(run.rect, pageSize);
    if (previousRun && shouldSeparateTextRuns(previousRun, run, pageSize)) {
      text += ' ';
    }

    const start = text.length;
    text += normalizedText;
    segments.push({
      start,
      end: text.length,
      text: normalizedText,
      rect,
    });
    previousRun = run;
  }

  return { text, segments };
}

function shouldSeparateTextRuns(
  previous: PdfTextRun,
  current: PdfTextRun,
  pageSize: Size,
): boolean {
  if (/\s$/u.test(previous.text) || /^\s/u.test(current.text)) {
    return true;
  }

  if (current.charIndex > previous.charIndex + previous.charCount) {
    return true;
  }

  const previousRect = sanitizeRect(previous.rect, pageSize);
  const currentRect = sanitizeRect(current.rect, pageSize);
  if (!previousRect || !currentRect) {
    return false;
  }

  if (!areRectsOnSameTextLine(previousRect, currentRect)) {
    return !/[-\u00ad]$/u.test(previous.text);
  }

  const gap = currentRect.origin.x - (
    previousRect.origin.x + previousRect.size.width
  );
  const referenceHeight = Math.min(
    previousRect.size.height,
    currentRect.size.height,
  );

  return (
    currentRect.origin.x < previousRect.origin.x - referenceHeight
    || gap > Math.max(1, referenceHeight * 0.15)
  );
}

function areRectsOnSameTextLine(left: Rect, right: Rect): boolean {
  const overlapTop = Math.max(left.origin.y, right.origin.y);
  const overlapBottom = Math.min(
    left.origin.y + left.size.height,
    right.origin.y + right.size.height,
  );
  const overlap = Math.max(0, overlapBottom - overlapTop);
  const minimumHeight = Math.min(left.size.height, right.size.height);
  return minimumHeight > 0 && overlap / minimumHeight >= 0.6;
}

function createChunkRects(
  segments: NormalizedRunSegment[],
  chunkStart: number,
  chunkEnd: number,
): Rect[] {
  const rects = segments.flatMap((segment) => {
    if (!segment.rect || segment.end <= chunkStart || segment.start >= chunkEnd) {
      return [];
    }

    const overlapStart = Math.max(chunkStart, segment.start) - segment.start;
    const overlapEnd = Math.min(chunkEnd, segment.end) - segment.start;
    return [sliceTextRect(segment.rect, overlapStart, overlapEnd, segment.text.length)];
  });

  return mergeAdjacentTextRects(rects);
}

function sliceTextRect(
  rect: Rect,
  start: number,
  end: number,
  textLength: number,
): Rect {
  if (start <= 0 && end >= textLength) {
    return cloneRect(rect);
  }

  const startRatio = Math.max(0, Math.min(1, start / textLength));
  const endRatio = Math.max(startRatio, Math.min(1, end / textLength));
  const ratio = endRatio - startRatio;

  if (rect.size.width >= rect.size.height) {
    return {
      origin: {
        x: rect.origin.x + rect.size.width * startRatio,
        y: rect.origin.y,
      },
      size: {
        width: rect.size.width * ratio,
        height: rect.size.height,
      },
    };
  }

  return {
    origin: {
      x: rect.origin.x,
      y: rect.origin.y + rect.size.height * startRatio,
    },
    size: {
      width: rect.size.width,
      height: rect.size.height * ratio,
    },
  };
}

function mergeAdjacentTextRects(rects: Rect[]): Rect[] {
  const merged: Rect[] = [];

  for (const rect of rects) {
    const previous = merged.at(-1);
    if (!previous || !canMergeHorizontalRects(previous, rect)) {
      merged.push(cloneRect(rect));
      continue;
    }

    const left = Math.min(previous.origin.x, rect.origin.x);
    const top = Math.min(previous.origin.y, rect.origin.y);
    const right = Math.max(
      previous.origin.x + previous.size.width,
      rect.origin.x + rect.size.width,
    );
    const bottom = Math.max(
      previous.origin.y + previous.size.height,
      rect.origin.y + rect.size.height,
    );
    previous.origin = { x: left, y: top };
    previous.size = { width: right - left, height: bottom - top };
  }

  return merged;
}

function canMergeHorizontalRects(left: Rect, right: Rect): boolean {
  const gap = right.origin.x - (left.origin.x + left.size.width);
  const referenceHeight = Math.max(left.size.height, right.size.height);

  return (
    areRectsOnSameTextLine(left, right)
    && gap >= -referenceHeight * 0.25
    && gap <= referenceHeight * 0.75
  );
}

function sanitizeRect(rect: Rect, pageSize: Size): Rect | undefined {
  const values = [
    rect.origin.x,
    rect.origin.y,
    rect.size.width,
    rect.size.height,
    pageSize.width,
    pageSize.height,
  ];
  if (
    values.some((value) => !Number.isFinite(value))
    || rect.size.width <= 0
    || rect.size.height <= 0
    || pageSize.width <= 0
    || pageSize.height <= 0
  ) {
    return undefined;
  }

  const left = Math.max(0, Math.min(pageSize.width, rect.origin.x));
  const top = Math.max(0, Math.min(pageSize.height, rect.origin.y));
  const right = Math.max(
    left,
    Math.min(pageSize.width, rect.origin.x + rect.size.width),
  );
  const bottom = Math.max(
    top,
    Math.min(pageSize.height, rect.origin.y + rect.size.height),
  );
  if (right <= left || bottom <= top) {
    return undefined;
  }

  return {
    origin: { x: left, y: top },
    size: { width: right - left, height: bottom - top },
  };
}

function cloneRect(rect: Rect): Rect {
  return {
    origin: { ...rect.origin },
    size: { ...rect.size },
  };
}
