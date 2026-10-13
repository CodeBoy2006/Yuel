import type {
  PdfDocumentObject,
  PdfPageObject,
  Rotation,
} from '@embedpdf/models';

import {
  READING_VISIBILITY_THRESHOLD,
  type ReadingChunkVisibility,
} from '../../analytics/readingSession';
import {
  measureViewportChunk,
  type RectBounds,
  type ViewportChunkMeasurement,
} from '../../analytics/viewportGeometry';
import type { TextChunkSnapshot } from '../../domain/events';
import { projectPdfReadingChunkRects } from './textModel';
import type {
  PdfReadingSnapshot,
  PdfReadingTextChunk,
} from './types';

export const PDF_READING_PAGE_SELECTOR =
  '.pdf-reader__page-shell[data-page-number]';

export interface PdfReadingLayoutSnapshot {
  viewport: RectBounds;
  pages: ReadonlyMap<number, RectBounds>;
}

export interface PdfReadingRuntimeModel {
  document: PdfDocumentObject;
  snapshot: PdfReadingSnapshot;
  eventChunks: TextChunkSnapshot[];
  chunksById: ReadonlyMap<string, PdfReadingTextChunk>;
  chunksByPageNumber: ReadonlyMap<number, PdfReadingTextChunk[]>;
  pagesByIndex: ReadonlyMap<number, PdfPageObject>;
}

export interface PdfReadingVisibilityResult {
  trackedChunkIds: Set<string>;
  updates: ReadingChunkVisibility[];
}

export function createPdfReadingRuntimeModel(
  snapshot: PdfReadingSnapshot,
  document: PdfDocumentObject,
): PdfReadingRuntimeModel {
  if (snapshot.page.resourceId !== document.id) {
    throw new RangeError('PDF reading snapshot must match the active document ID.');
  }

  const pagesByIndex = new Map(
    document.pages.map((page) => [page.index, page]),
  );
  const chunksById = new Map<string, PdfReadingTextChunk>();
  const chunksByPageNumber = new Map<number, PdfReadingTextChunk[]>();

  for (const chunk of snapshot.chunks) {
    if (!pagesByIndex.has(chunk.pageIndex)) {
      throw new RangeError(
        `PDF reading chunk ${chunk.chunkId} references a missing page.`,
      );
    }
    if (chunksById.has(chunk.chunkId)) {
      throw new RangeError(`PDF reading chunk id is duplicated: ${chunk.chunkId}`);
    }

    chunksById.set(chunk.chunkId, chunk);
    const pageChunks = chunksByPageNumber.get(chunk.pageNumber) ?? [];
    pageChunks.push(chunk);
    chunksByPageNumber.set(chunk.pageNumber, pageChunks);
  }

  return {
    document,
    snapshot,
    eventChunks: snapshot.chunks.map(toEventChunkSnapshot),
    chunksById,
    chunksByPageNumber,
    pagesByIndex,
  };
}

export function capturePdfReadingLayout(
  viewportElement: HTMLElement,
): PdfReadingLayoutSnapshot {
  const pages = new Map<number, RectBounds>();

  for (const element of viewportElement.querySelectorAll<HTMLElement>(
    PDF_READING_PAGE_SELECTOR,
  )) {
    const pageNumber = Number.parseInt(element.dataset.pageNumber ?? '', 10);
    if (!Number.isSafeInteger(pageNumber) || pageNumber <= 0) {
      continue;
    }

    const bounds = element.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0) {
      pages.set(pageNumber, bounds);
    }
  }

  return {
    viewport: viewportElement.getBoundingClientRect(),
    pages,
  };
}

export function measurePdfReadingChunk(
  model: PdfReadingRuntimeModel,
  chunkId: string,
  documentRotation: Rotation,
  scale: number,
  layout: PdfReadingLayoutSnapshot,
): ViewportChunkMeasurement | undefined {
  if (!Number.isFinite(scale) || scale <= 0) {
    return undefined;
  }

  const chunk = model.chunksById.get(chunkId);
  if (!chunk) {
    return undefined;
  }

  const page = model.pagesByIndex.get(chunk.pageIndex);
  const pageBounds = layout.pages.get(chunk.pageNumber);
  if (!page || !pageBounds) {
    return undefined;
  }

  const clientRects = projectPdfReadingChunkRects(
    chunk,
    page,
    documentRotation,
    scale,
  ).map((rect): RectBounds => ({
    left: pageBounds.left + rect.origin.x,
    top: pageBounds.top + rect.origin.y,
    right: pageBounds.left + rect.origin.x + rect.size.width,
    bottom: pageBounds.top + rect.origin.y + rect.size.height,
    width: rect.size.width,
    height: rect.size.height,
  }));

  return measureViewportChunk(
    clientRects,
    layout.viewport,
    chunk.wordCount,
    1,
  );
}

export function collectPdfReadingVisibility(
  model: PdfReadingRuntimeModel,
  documentRotation: Rotation,
  scale: number,
  layout: PdfReadingLayoutSnapshot,
  previouslyTrackedChunkIds: ReadonlySet<string>,
): PdfReadingVisibilityResult {
  const trackedChunkIds = new Set<string>();
  const updates: ReadingChunkVisibility[] = [];

  for (const pageNumber of layout.pages.keys()) {
    for (const chunk of model.chunksByPageNumber.get(pageNumber) ?? []) {
      trackedChunkIds.add(chunk.chunkId);
      const measurement = measurePdfReadingChunk(
        model,
        chunk.chunkId,
        documentRotation,
        scale,
        layout,
      );
      const visibleRatio = measurement?.visibleRatio ?? 0;
      updates.push({
        chunkId: chunk.chunkId,
        visible: visibleRatio >= READING_VISIBILITY_THRESHOLD,
        visibleRatio,
      });
    }
  }

  for (const chunkId of previouslyTrackedChunkIds) {
    if (!trackedChunkIds.has(chunkId)) {
      updates.push({
        chunkId,
        visible: false,
        visibleRatio: 0,
      });
    }
  }

  return { trackedChunkIds, updates };
}

function toEventChunkSnapshot(
  chunk: PdfReadingTextChunk,
): TextChunkSnapshot {
  const {
    pageIndex: _pageIndex,
    pageNumber: _pageNumber,
    rects: _rects,
    ...eventChunk
  } = chunk;

  return eventChunk;
}
