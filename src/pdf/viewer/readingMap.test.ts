import type { PdfBookmarkObject } from '@embedpdf/models';
import { PdfActionType, PdfZoomMode } from '@embedpdf/models';
import { describe, expect, it } from 'vitest';

import type { PdfPageReadingProgress } from '../analytics/progress';
import { createPdfChapterReadingProgress } from './readingMap';

describe('PDF chapter reading progress', () => {
  it('creates disjoint top-level chapter ranges and a preface', () => {
    const chapters = createPdfChapterReadingProgress([
      bookmark('Chapter one', 1),
      bookmark('Chapter two', 3),
    ], Array.from({ length: 5 }, (_, pageIndex) => page(pageIndex, 100, pageIndex * 20)));

    expect(chapters.map((chapter) => ({
      title: chapter.title,
      range: [chapter.startPageNumber, chapter.endPageNumber],
      coveredWords: chapter.coveredWords,
    }))).toEqual([
      { title: '前置内容', range: [1, 1], coveredWords: 0 },
      { title: 'Chapter one', range: [2, 3], coveredWords: 60 },
      { title: 'Chapter two', range: [4, 5], coveredWords: 140 },
    ]);
  });

  it('uses the first reachable child destination for heading-only bookmarks', () => {
    const parent = {
      title: 'Part one',
      children: [bookmark('Nested chapter', 2)],
    } as PdfBookmarkObject;

    const chapters = createPdfChapterReadingProgress(
      [parent],
      Array.from({ length: 4 }, (_, pageIndex) => page(pageIndex, 50, 10)),
    );

    expect(chapters.map((chapter) => [
      chapter.title,
      chapter.startPageNumber,
      chapter.endPageNumber,
    ])).toEqual([
      ['前置内容', 1, 2],
      ['Part one', 3, 4],
    ]);
  });

  it('returns no chapter view when the PDF has no usable outline', () => {
    expect(createPdfChapterReadingProgress([], [page(0, 100, 0)])).toEqual([]);
  });
});

function page(
  pageIndex: number,
  totalWords: number,
  coveredWords: number,
): PdfPageReadingProgress {
  return {
    sectionId: `section-${pageIndex}`,
    pageIndex,
    pageNumber: pageIndex + 1,
    rotation: 0,
    size: { width: 600, height: 800 },
    chunks: [],
    totalWords,
    coveredWords,
    processedWords: coveredWords,
    effectiveReadingMs: coveredWords * 100,
    rawExposureMs: coveredWords * 120,
    coverageRatio: coveredWords / totalWords,
  };
}

function bookmark(title: string, pageIndex: number): PdfBookmarkObject {
  return {
    title,
    target: {
      type: 'action',
      action: {
        type: PdfActionType.Goto,
        destination: {
          pageIndex,
          view: [],
          zoom: {
            mode: PdfZoomMode.FitPage,
          },
        },
      },
    },
    children: [],
  };
}
