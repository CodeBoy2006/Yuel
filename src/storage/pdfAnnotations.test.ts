import { describe, expect, it, vi } from 'vitest';

import type {
  PdfAnnotationRecord,
  SavedItemRecord,
} from './schema';
import {
  getPdfBacklinkSourceRects,
  getPdfHighlightsForResource,
} from './pdfAnnotations';

const resourceId = `pdf_${'a'.repeat(64)}`;
const annotation: PdfAnnotationRecord = {
  id: 'pdf_annotation_saved_anchor',
  resourceId,
  pageIndex: 2,
  type: 'excerpt',
  quote: 'Evidence remains connected to its source.',
  textHash: 'hash',
  sourceRects: [
    { pageIndex: 2, x: 72, y: 180, width: 160, height: 18 },
    { pageIndex: 3, x: 72, y: 64, width: 120, height: 18 },
  ],
  createdAt: 1_000,
  updatedAt: 1_000,
};

describe('PDF backlink annotation lookup', () => {
  it('returns cloned source rectangles for the requested rendered page', async () => {
    const table = {
      get: vi.fn(async () => annotation),
    };

    await expect(getPdfBacklinkSourceRects({
      annotationId: annotation.id,
      resourceId,
      pageIndex: 2,
    }, 3, table)).resolves.toEqual([
      { pageIndex: 3, x: 72, y: 64, width: 120, height: 18 },
    ]);
    expect(table.get).toHaveBeenCalledWith(annotation.id);
  });

  it('rejects annotations that do not match the target identity', async () => {
    const table = {
      get: vi.fn(async () => annotation),
    };

    await expect(getPdfBacklinkSourceRects({
      annotationId: annotation.id,
      resourceId: `pdf_${'b'.repeat(64)}`,
      pageIndex: 2,
    }, 2, table)).resolves.toEqual([]);
    await expect(getPdfBacklinkSourceRects({
      annotationId: annotation.id,
      resourceId,
      pageIndex: 3,
    }, 3, table)).resolves.toEqual([]);
  });

  it('drops malformed rectangles from local storage', async () => {
    const table = {
      get: vi.fn(async () => ({
        ...annotation,
        sourceRects: [
          annotation.sourceRects[0]!,
          { pageIndex: 2, x: 0, y: 0, width: Number.NaN, height: 10 },
        ],
      })),
    };

    await expect(getPdfBacklinkSourceRects({
      annotationId: annotation.id,
      resourceId,
      pageIndex: 2,
    }, 2, table)).resolves.toEqual([
      annotation.sourceRects[0],
    ]);
  });
});

describe('PDF stored highlight lookup', () => {
  it('joins annotation anchors to saved items and defaults legacy colors', async () => {
    const savedItem: SavedItemRecord = {
      id: 'saved-anchor',
      text: annotation.quote,
      type: 'sentence',
      sourceDomain: 'pdf.local',
      tags: ['selection', 'pdf'],
      pdfAnnotationId: annotation.id,
      createdAt: 1_000,
      updatedAt: 1_100,
    };
    const store = createHighlightStore([annotation], [savedItem]);

    await expect(getPdfHighlightsForResource(resourceId, store)).resolves.toEqual([{
      annotation,
      color: 'yellow',
      savedItem,
    }]);
  });

  it('filters malformed rectangles and orphaned annotation anchors', async () => {
    const validAnnotation: PdfAnnotationRecord = {
      ...annotation,
      color: 'blue',
      sourceRects: [
        annotation.sourceRects[0]!,
        { pageIndex: 2, x: 0, y: 0, width: Number.NaN, height: 10 },
      ],
    };
    const orphan: PdfAnnotationRecord = {
      ...annotation,
      id: 'orphan',
      sourceRects: [{ pageIndex: 2, x: 10, y: 20, width: 30, height: 10 }],
    };
    const savedItem: SavedItemRecord = {
      id: 'saved-anchor',
      text: annotation.quote,
      type: 'sentence',
      sourceDomain: 'pdf.local',
      tags: ['selection', 'pdf', 'highlight'],
      pdfAnnotationId: annotation.id,
      createdAt: 1_000,
    };

    const highlights = await getPdfHighlightsForResource(
      resourceId,
      createHighlightStore([orphan, validAnnotation], [savedItem]),
    );

    expect(highlights).toHaveLength(1);
    expect(highlights[0]).toMatchObject({
      color: 'blue',
      annotation: {
        id: annotation.id,
        sourceRects: [annotation.sourceRects[0]],
      },
    });
  });
});

function createHighlightStore(
  annotations: PdfAnnotationRecord[],
  savedItems: SavedItemRecord[],
) {
  return {
    pdfAnnotations: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn(async () => annotations),
        })),
      })),
    },
    savedItems: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          toArray: vi.fn(async () => savedItems),
        })),
      })),
    },
  };
}
