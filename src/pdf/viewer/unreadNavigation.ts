import {
  Rotation,
  transformRect,
  type Rect,
} from '@embedpdf/models';

import type {
  PdfChunkReadingProgress,
  PdfDocumentReadingProgress,
} from '../analytics/progress';

export const PDF_UNREAD_COMPLETION_RATIO = 0.9;
const PDF_UNREAD_VISIBLE_LINE_TOLERANCE = 12;

export interface PdfUnreadSearchPosition {
  pageNumber: number;
  /** Unscaled Y offset inside the currently displayed, rotated page. */
  pageY?: number;
  documentRotation?: Rotation;
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

interface PdfUnreadChunkEntry {
  chunk: PdfChunkReadingProgress;
  displayedRects: Rect[];
  sourceIndex: number;
}

export function findNextUnreadPdfChunk(
  progress: PdfDocumentReadingProgress,
  position: PdfUnreadSearchPosition,
): PdfUnreadLocation | undefined {
  const documentRotation = position.documentRotation ?? Rotation.Degree0;
  const chunks = createOrderedChunkEntries(progress, documentRotation);
  const cursorIndex = position.afterChunkId
    ? chunks.findIndex(({ chunk }) => chunk.chunkId === position.afterChunkId)
    : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;

  for (let index = startIndex; index < chunks.length; index += 1) {
    const entry = chunks[index];
    const { chunk } = entry;
    if (!isPdfChunkUnread(chunk)) continue;

    if (cursorIndex < 0) {
      if (chunk.pageNumber < position.pageNumber) continue;
      if (
        chunk.pageNumber === position.pageNumber
        && !isChunkAtOrAfterVisibleLine(
          entry.displayedRects,
          position.pageY ?? 0,
        )
      ) {
        continue;
      }
    }

    return createPdfUnreadLocation(chunk);
  }

  return undefined;
}

function createOrderedChunkEntries(
  progress: PdfDocumentReadingProgress,
  documentRotation: Rotation,
): PdfUnreadChunkEntry[] {
  return [...progress.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .flatMap((page) => {
      const rotation = ((page.rotation + documentRotation) % 4) as Rotation;
      const entries = page.chunks.map((chunk, sourceIndex) => ({
        chunk,
        displayedRects: chunk.rects.map((rect) =>
          transformRect(page.size, rect, rotation, 1)),
        sourceIndex,
      }));
      if (rotation === Rotation.Degree0) return entries;

      return entries.sort(compareDisplayedChunkEntries);
    });
}

function compareDisplayedChunkEntries(
  left: PdfUnreadChunkEntry,
  right: PdfUnreadChunkEntry,
): number {
  const leftAnchor = getFirstRect(left.displayedRects);
  const rightAnchor = getFirstRect(right.displayedRects);
  if (!leftAnchor || !rightAnchor) {
    if (leftAnchor) return -1;
    if (rightAnchor) return 1;
    return left.sourceIndex - right.sourceIndex;
  }
  if (leftAnchor.origin.y !== rightAnchor.origin.y) {
    return leftAnchor.origin.y - rightAnchor.origin.y;
  }
  if (leftAnchor.origin.x !== rightAnchor.origin.x) {
    return leftAnchor.origin.x - rightAnchor.origin.x;
  }
  return left.sourceIndex - right.sourceIndex;
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
  const anchor = getFirstRect(chunk.rects);

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
  displayedRects: Rect[],
  pageY: number,
): boolean {
  if (pageY <= 0) return true;
  if (displayedRects.length === 0) return false;

  const bottom = Math.max(
    ...displayedRects.map((rect) => rect.origin.y + rect.size.height),
  );
  return bottom >= pageY - PDF_UNREAD_VISIBLE_LINE_TOLERANCE;
}

function getFirstRect(rects: Rect[]): Rect | undefined {
  return rects.reduce<Rect | undefined>((first, rect) => {
    if (!first) return rect;
    if (rect.origin.y !== first.origin.y) {
      return rect.origin.y < first.origin.y ? rect : first;
    }
    return rect.origin.x < first.origin.x ? rect : first;
  }, undefined);
}
