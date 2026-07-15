import { describe, expect, it, vi } from 'vitest';

import type {
  PdfAnnotationRecord,
  SavedItemRecord,
} from './schema';
import {
  getSavedItemLibrary,
  type SavedItemLibraryStore,
} from './savedItemLibrary';

const createdAt = Date.UTC(2026, 6, 15, 8, 30, 0);
const resourceId = `pdf_${'a'.repeat(64)}`;

function createStore(
  records: SavedItemRecord[],
  annotations: PdfAnnotationRecord[] = [],
): SavedItemLibraryStore {
  return {
    savedItems: {
      orderBy(index) {
        expect(index).toBe('createdAt');
        return {
          reverse() {
            return {
              async toArray() {
                return records;
              },
            };
          },
        };
      },
    },
    pdfAnnotations: {
      bulkGet: vi.fn(async (ids: string[]) => ids.map(
        (id) => annotations.find((annotation) => annotation.id === id),
      )),
    },
  };
}

describe('getSavedItemLibrary', () => {
  it('normalizes web source, notes, and user tags for management', async () => {
    const items = await getSavedItemLibrary(createStore([{
      id: 'saved-web',
      text: '  fail\n gracefully under pressure  ',
      type: 'phrase',
      sourceDomain: 'developer.mozilla.org',
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      sourceTitle: '  Web API reference  ',
      tags: ['selection'],
      userTags: [' Reliability ', 'reliability', 'Architecture'],
      note: '  Use this in the retry design.\r\nKeep the state visible.  ',
      createdAt,
      updatedAt: createdAt + 1_000,
    }]));

    expect(items).toEqual([{
      id: 'saved-web',
      text: 'fail gracefully under pressure',
      type: 'phrase',
      sourceKind: 'web',
      sourceDomain: 'developer.mozilla.org',
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      sourceTitle: 'Web API reference',
      note: 'Use this in the retry design.\nKeep the state visible.',
      userTags: ['Reliability', 'Architecture'],
      createdAt,
      updatedAt: createdAt + 1_000,
    }]);
  });

  it('joins PDF records to their precise local source anchor', async () => {
    const annotation: PdfAnnotationRecord = {
      id: 'pdf_annotation_saved-pdf',
      resourceId,
      pageIndex: 3,
      type: 'excerpt',
      quote: 'Evidence remains connected.',
      textHash: 'hash',
      sourceRects: [{
        pageIndex: 3,
        x: 72,
        y: 144,
        width: 180,
        height: 18,
      }],
      createdAt,
      updatedAt: createdAt,
    };
    const items = await getSavedItemLibrary(createStore([{
      id: 'saved-pdf',
      text: 'Evidence remains connected.',
      type: 'sentence',
      sourceDomain: 'pdf.local',
      sourceTitle: 'Reference.pdf',
      tags: ['selection', 'pdf'],
      pdfAnnotationId: annotation.id,
      createdAt,
    }], [annotation]));

    expect(items).toEqual([expect.objectContaining({
      id: 'saved-pdf',
      sourceKind: 'pdf',
      sourceTitle: 'Reference.pdf',
      pdfAnchor: {
        annotationId: annotation.id,
        resourceId,
        pageIndex: 3,
        pageCoordinates: {
          x: 72,
          y: 144,
        },
      },
    })]);
  });

  it('keeps an excerpt visible when its optional source metadata is malformed', async () => {
    const items = await getSavedItemLibrary(createStore([{
      id: 'saved-legacy',
      text: 'Legacy excerpt',
      type: 'phrase',
      sourceDomain: '   ',
      sourceUrl: 'javascript:alert(1)',
      tags: ['selection'],
      createdAt,
    }]));

    expect(items).toEqual([{
      id: 'saved-legacy',
      text: 'Legacy excerpt',
      type: 'phrase',
      sourceKind: 'web',
      sourceDomain: 'unknown',
      userTags: [],
      createdAt,
      updatedAt: createdAt,
    }]);
  });
});
