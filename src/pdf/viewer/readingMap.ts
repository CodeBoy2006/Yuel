import type { PdfBookmarkObject } from '@embedpdf/models';

import {
  aggregatePdfReadingProgress,
  type PdfPageReadingProgress,
  type PdfReadingProgressMetrics,
} from '../analytics/progress';
import { getPdfOutlineDestination } from './outline';

export interface PdfChapterReadingProgress extends PdfReadingProgressMetrics {
  id: string;
  title: string;
  startPageIndex: number;
  endPageIndex: number;
  startPageNumber: number;
  endPageNumber: number;
}

interface ChapterBoundary {
  id: string;
  title: string;
  pageIndex: number;
}

export function createPdfChapterReadingProgress(
  bookmarks: PdfBookmarkObject[],
  pages: PdfPageReadingProgress[],
): PdfChapterReadingProgress[] {
  if (pages.length === 0) return [];

  const boundaries = createChapterBoundaries(bookmarks, pages.length);
  if (boundaries.length === 0) return [];

  const completeBoundaries = boundaries[0]!.pageIndex > 0
    ? [{
        id: 'preface',
        title: '前置内容',
        pageIndex: 0,
      }, ...boundaries]
    : boundaries;

  return completeBoundaries.flatMap((boundary, index) => {
    const nextBoundary = completeBoundaries[index + 1];
    const startPageIndex = boundary.pageIndex;
    const endPageIndex = Math.max(
      startPageIndex,
      Math.min(pages.length - 1, (nextBoundary?.pageIndex ?? pages.length) - 1),
    );
    const chapterPages = pages.filter(
      (page) => page.pageIndex >= startPageIndex && page.pageIndex <= endPageIndex,
    );
    if (chapterPages.length === 0) return [];

    return [{
      id: boundary.id,
      title: boundary.title,
      startPageIndex,
      endPageIndex,
      startPageNumber: startPageIndex + 1,
      endPageNumber: endPageIndex + 1,
      ...aggregatePdfReadingProgress(chapterPages),
    }];
  });
}

function createChapterBoundaries(
  bookmarks: PdfBookmarkObject[],
  pageCount: number,
): ChapterBoundary[] {
  const seenPages = new Set<number>();
  const boundaries: ChapterBoundary[] = [];

  bookmarks.forEach((bookmark, index) => {
    const destination = getBookmarkDestination(bookmark);
    const pageIndex = destination?.pageIndex;
    if (
      pageIndex === undefined
      || pageIndex < 0
      || pageIndex >= pageCount
      || seenPages.has(pageIndex)
    ) {
      return;
    }

    seenPages.add(pageIndex);
    boundaries.push({
      id: `chapter-${index}-${pageIndex}`,
      title: bookmark.title.trim() || `第 ${boundaries.length + 1} 章`,
      pageIndex,
    });
  });

  return boundaries.sort((left, right) => left.pageIndex - right.pageIndex);
}

function getBookmarkDestination(
  bookmark: PdfBookmarkObject,
): ReturnType<typeof getPdfOutlineDestination> {
  const ownDestination = getPdfOutlineDestination(bookmark);
  if (ownDestination) return ownDestination;

  for (const child of bookmark.children ?? []) {
    const childDestination = getBookmarkDestination(child);
    if (childDestination) return childDestination;
  }

  return undefined;
}
