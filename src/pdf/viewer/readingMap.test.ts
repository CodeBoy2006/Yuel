import type { PdfBookmarkObject } from '@embedpdf/models';
import { PdfActionType, PdfZoomMode } from '@embedpdf/models';
import { describe, expect, it } from 'vitest';

import type {
  PdfPageReadingProgress,
  PdfReadingProgressMetrics,
} from '../analytics/progress';
import {
  createPdfChapterReadingProgress,
  createPdfReadingMapOverviewSegments,
  createPdfReadingMapVisuals,
} from './readingMap';

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

describe('PDF reading map visualization', () => {
  it('normalizes unsorted paces without changing source order', () => {
    const items = [300, 180, 240].map((wordsPerMinute) => metrics({ wordsPerMinute }));

    expect(createPdfReadingMapVisuals(items).map((visual) => visual.paceRatio)).toEqual([1, 0, 0.5]);
    expect(items.map((item) => item.wordsPerMinute)).toEqual([300, 180, 240]);
  });

  it('compresses long documents into contiguous overview segments', () => {
    const segments = createPdfReadingMapOverviewSegments(
      Array.from(
        { length: 5 },
        (_, pageIndex) => page(pageIndex, 100, pageIndex * 20),
      ),
      2,
    );

    expect(segments.map((segment) => ({
      range: [segment.startPageNumber, segment.endPageNumber],
      totalWords: segment.totalWords,
      coveredWords: segment.coveredWords,
    }))).toEqual([
      { range: [1, 3], totalWords: 300, coveredWords: 60 },
      { range: [4, 5], totalWords: 200, coveredWords: 140 },
    ]);
  });

  it('uses the full overview resolution without leaving page gaps', () => {
    const segments = createPdfReadingMapOverviewSegments(
      Array.from(
        { length: 73 },
        (_, pageIndex) => page(pageIndex, 100, 0),
      ),
      72,
    );

    expect(segments).toHaveLength(72);
    expect(segments[0]!.startPageNumber).toBe(1);
    expect(segments.at(-1)!.endPageNumber).toBe(73);
    expect(segments.every((segment, index) => (
      index === 0
      || segment.startPageNumber === segments[index - 1]!.endPageNumber + 1
    ))).toBe(true);
  });

  it('keeps empty evidence distinct while normalizing visual density', () => {
    const visuals = createPdfReadingMapVisuals([
      metrics({ totalWords: 0 }),
      metrics({ totalWords: 120 }),
      metrics({
        totalWords: 400,
        coveredWords: 200,
        processedWords: 180,
        effectiveReadingMs: 60_000,
        coverageRatio: 0.5,
        wordsPerMinute: 180,
      }),
      metrics({
        totalWords: 1_600,
        coveredWords: 1_200,
        processedWords: 1_000,
        effectiveReadingMs: 240_000,
        coverageRatio: 0.75,
        wordsPerMinute: 300,
      }),
    ]);

    expect(visuals.map((visual) => visual.evidence)).toEqual([
      'no-text',
      'unrecorded',
      'measured',
      'measured',
    ]);
    expect(visuals[0]!.textRatio).toBeLessThan(visuals[1]!.textRatio);
    expect(visuals[1]!.textRatio).toBeLessThan(visuals[3]!.textRatio);
    expect(visuals[2]!.timeLevel).toBeLessThan(visuals[3]!.timeLevel);
    expect(visuals[2]!.paceRatio).toBe(0);
    expect(visuals[3]!.paceRatio).toBe(1);
    expect(visuals[3]!.coverageRatio).toBe(0.75);
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

function metrics(
  overrides: Partial<PdfReadingProgressMetrics>,
): PdfReadingProgressMetrics {
  return {
    totalWords: 0,
    coveredWords: 0,
    processedWords: 0,
    effectiveReadingMs: 0,
    rawExposureMs: 0,
    ...overrides,
  };
}
