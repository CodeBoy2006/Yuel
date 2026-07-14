import { describe, expect, it, vi } from 'vitest';

import type { PdfAnnotationRecord } from './schema';
import { getPdfBacklinkSourceRects } from './pdfAnnotations';

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
