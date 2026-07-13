import {
  Rotation,
  type PdfDocumentObject,
  type PdfPageObject,
} from '@embedpdf/models';
import { describe, expect, it, vi } from 'vitest';

import { createChunkId, hashText } from '../../domain/events';
import type {
  PdfReadingSnapshot,
  PdfReadingTextChunk,
} from './types';
import {
  capturePdfReadingLayout,
  collectPdfReadingVisibility,
  createPdfReadingRuntimeModel,
  measurePdfReadingChunk,
} from './runtime';

const resourceId = `pdf_${'b'.repeat(64)}`;
const page: PdfPageObject = {
  index: 0,
  size: { width: 100, height: 200 },
  rotation: Rotation.Degree0,
  objectNumber: 7,
};
const pdfDocument: PdfDocumentObject = {
  id: resourceId,
  pageCount: 1,
  pages: [page],
  isEncrypted: false,
  isOwnerUnlocked: false,
  permissions: 0,
  normalizedRotation: false,
};

function createSnapshot(): PdfReadingSnapshot {
  const pageId = `pdf.local_${hashText(resourceId)}`;
  const text =
    'Stable PDF runtime geometry keeps visible reading chunks aligned after zoom.';
  const sourceKey = 'section(test)::segment(1)';
  const chunk: PdfReadingTextChunk = {
    chunkId: createChunkId(pageId, text, sourceKey),
    pageId,
    sectionId: `${resourceId}_section_test`,
    textHash: hashText(text),
    text,
    sourceKey,
    wordCount: 11,
    sentenceCount: 1,
    selector: 'pdf-page(1)::segment(1)',
    pageIndex: 0,
    pageNumber: 1,
    rects: [{
      origin: { x: 10, y: 20 },
      size: { width: 40, height: 20 },
    }],
  };

  return {
    page: {
      pageId,
      domain: 'pdf.local',
      resourceType: 'pdf',
      resourceId,
      titleHash: hashText('Runtime test.pdf'),
      urlHash: hashText(resourceId),
      language: 'en',
      totalWords: chunk.wordCount,
      metricModelVersion: 2,
      capturedAt: 1,
    },
    sections: [{
      sectionId: chunk.sectionId,
      pageIndex: 0,
      pageNumber: 1,
      objectNumber: page.objectNumber,
      size: page.size,
      rotation: page.rotation,
      wordCount: chunk.wordCount,
      chunks: [chunk],
    }],
    chunks: [chunk],
  };
}

function bounds(
  left: number,
  top: number,
  width: number,
  height: number,
) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe('PDF reading runtime adapter', () => {
  it('removes local geometry fields from runtime event chunks', () => {
    const snapshot = createSnapshot();
    const model = createPdfReadingRuntimeModel(snapshot, pdfDocument);

    expect(model.eventChunks).toEqual([expect.objectContaining({
      chunkId: snapshot.chunks[0].chunkId,
      sectionId: snapshot.chunks[0].sectionId,
      text: snapshot.chunks[0].text,
    })]);
    expect(model.eventChunks[0]).not.toHaveProperty('rects');
    expect(model.eventChunks[0]).not.toHaveProperty('pageIndex');
    expect(model.eventChunks[0]).not.toHaveProperty('pageNumber');
  });

  it('projects source rectangles into an offset viewport at the active scale', () => {
    const model = createPdfReadingRuntimeModel(createSnapshot(), pdfDocument);
    const layout = {
      viewport: bounds(100, 100, 300, 300),
      pages: new Map([[1, bounds(120, 80, 200, 400)]]),
    };
    const measurement = measurePdfReadingChunk(
      model,
      model.snapshot.chunks[0].chunkId,
      Rotation.Degree0,
      2,
      layout,
    );

    expect(measurement).toEqual(expect.objectContaining({
      visibleRatio: 1,
      visibleWordCount: 11,
      contentMultiplier: 1,
    }));
    expect(measurement?.viewportY).toBeCloseTo(2 / 15);
  });

  it('emits hidden updates when a virtualized page is unmounted', () => {
    const model = createPdfReadingRuntimeModel(createSnapshot(), pdfDocument);
    const chunkId = model.snapshot.chunks[0].chunkId;
    const mounted = collectPdfReadingVisibility(
      model,
      Rotation.Degree0,
      1,
      {
        viewport: bounds(0, 0, 300, 300),
        pages: new Map([[1, bounds(0, 0, 100, 200)]]),
      },
      new Set(),
    );

    expect(mounted.trackedChunkIds).toEqual(new Set([chunkId]));
    expect(mounted.updates).toEqual([expect.objectContaining({
      chunkId,
      visible: true,
      visibleRatio: 1,
    })]);

    const unmounted = collectPdfReadingVisibility(
      model,
      Rotation.Degree0,
      1,
      {
        viewport: bounds(0, 0, 300, 300),
        pages: new Map(),
      },
      mounted.trackedChunkIds,
    );
    expect(unmounted.trackedChunkIds.size).toBe(0);
    expect(unmounted.updates).toEqual([{
      chunkId,
      visible: false,
      visibleRatio: 0,
    }]);
  });

  it('captures only valid mounted page shells from the reader DOM', () => {
    const viewport = document.createElement('div');
    const validPage = document.createElement('div');
    const invalidPage = document.createElement('div');
    validPage.className = 'pdf-reader__page-shell';
    validPage.dataset.pageNumber = '1';
    invalidPage.className = 'pdf-reader__page-shell';
    invalidPage.dataset.pageNumber = 'unknown';
    viewport.append(validPage, invalidPage);

    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(
      bounds(10, 20, 500, 600) as DOMRect,
    );
    vi.spyOn(validPage, 'getBoundingClientRect').mockReturnValue(
      bounds(30, 40, 300, 400) as DOMRect,
    );
    vi.spyOn(invalidPage, 'getBoundingClientRect').mockReturnValue(
      bounds(0, 0, 100, 100) as DOMRect,
    );

    const layout = capturePdfReadingLayout(viewport);

    expect(layout.viewport).toEqual(bounds(10, 20, 500, 600));
    expect(layout.pages).toEqual(new Map([[1, bounds(30, 40, 300, 400)]]));
  });

  it('rejects a snapshot for a different active document', () => {
    expect(() => createPdfReadingRuntimeModel(createSnapshot(), {
      ...pdfDocument,
      id: `pdf_${'c'.repeat(64)}`,
    })).toThrow(/active document ID/);
  });
});
