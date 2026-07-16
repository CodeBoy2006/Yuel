import type { Rect } from '@embedpdf/models';

import type {
  PdfChunkReadingProgress,
  PdfDocumentReadingProgress,
} from '../analytics/progress';

export const PDF_UNREAD_COMPLETION_RATIO = 0.9;
const PDF_UNREAD_VISIBLE_LINE_TOLERANCE = 12;

export interface PdfUnreadSearchPosition {
  pageNumber: number;
  pageY?: number;
  afterChunkId?: string;
}

export interface PdfUnreadLocation {
  chunkId: string;
  coveredWords: number;
  pageCoordinates?: {
    x: number;
    y: number;
  };
  pageIndex: number;
  pageNumber: number;
  sourceRects: Rect[];
  wordCount: number;
}

export interface PdfUnreadTarget extends PdfUnreadLocation {
  requestId: number;
}

export function findNextUnreadPdfChunk(
  progress: PdfDocumentReadingProgress,
  position: PdfUnreadSearchPosition,
): PdfUnreadLocation | undefined {
  const chunks = progress.pages.flatMap((page) => page.chunks);
  const cursorIndex = position.afterChunkId
    ? chunks.findIndex((chunk) => chunk.chunkId === position.afterChunkId)
    : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;

  for (let index = startIndex; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!isPdfChunkUnread(chunk)) continue;

    if (cursorIndex < 0) {
      if (chunk.pageNumber < position.pageNumber) continue;
      if (
        chunk.pageNumber === position.pageNumber
        && !isChunkAtOrAfterVisibleLine(chunk, position.pageY ?? 0)
      ) {
        continue;
      }
    }

    return createPdfUnreadLocation(chunk);
  }

  return undefined;
}

export function isPdfChunkUnread(chunk: PdfChunkReadingProgress): boolean {
  if (chunk.wordCount <= 0) return false;
  const coveredWords = Math.min(
    chunk.wordCount,
    Math.max(0, chunk.coveredWords),
  );
  return coveredWords / chunk.wordCount < PDF_UNREAD_COMPLETION_RATIO;
}

function createPdfUnreadLocation(
  chunk: PdfChunkReadingProgress,
): PdfUnreadLocation {
  const anchor = getFirstSourceRect(chunk.rects);

  return {
    chunkId: chunk.chunkId,
    coveredWords: chunk.coveredWords,
    pageIndex: chunk.pageIndex,
    pageNumber: chunk.pageNumber,
    sourceRects: chunk.rects,
    wordCount: chunk.wordCount,
    ...(anchor
      ? {
          pageCoordinates: {
            x: Math.max(0, anchor.origin.x - 8),
            y: Math.max(0, anchor.origin.y - 18),
          },
        }
      : {}),
  };
}

function isChunkAtOrAfterVisibleLine(
  chunk: PdfChunkReadingProgress,
  pageY: number,
): boolean {
  if (pageY <= 0) return true;
  if (chunk.rects.length === 0) return false;

  const bottom = Math.max(
    ...chunk.rects.map((rect) => rect.origin.y + rect.size.height),
  );
  return bottom >= pageY - PDF_UNREAD_VISIBLE_LINE_TOLERANCE;
}

function getFirstSourceRect(rects: Rect[]): Rect | undefined {
  return rects.reduce<Rect | undefined>((first, rect) => {
    if (!first) return rect;
    if (rect.origin.y !== first.origin.y) {
      return rect.origin.y < first.origin.y ? rect : first;
    }
    return rect.origin.x < first.origin.x ? rect : first;
  }, undefined);
}
