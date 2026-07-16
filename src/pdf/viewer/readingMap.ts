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

export type PdfReadingMapEvidence = 'measured' | 'unrecorded' | 'no-text';

export interface PdfReadingMapVisual {
  coverageRatio: number;
  evidence: PdfReadingMapEvidence;
  paceRatio?: number;
  textRatio: number;
  timeLevel: 0 | 1 | 2 | 3 | 4;
}

export interface PdfReadingMapOverviewSegment extends PdfReadingProgressMetrics {
  id: string;
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

export function createPdfReadingMapOverviewSegments(
  pages: PdfPageReadingProgress[],
  maximumSegments = 72,
): PdfReadingMapOverviewSegment[] {
  if (pages.length === 0) return [];

  const segmentLimit = Math.max(1, Math.floor(maximumSegments));
  const segmentCount = Math.min(pages.length, segmentLimit);

  return Array.from({ length: segmentCount }, (_, segmentIndex) => {
    const start = Math.round((segmentIndex * pages.length) / segmentCount);
    const end = Math.round(((segmentIndex + 1) * pages.length) / segmentCount);
    const segmentPages = pages.slice(start, end);
    const firstPage = segmentPages[0]!;
    const lastPage = segmentPages.at(-1)!;

    return {
      id: `overview-${firstPage.sectionId}-${lastPage.sectionId}`,
      startPageNumber: firstPage.pageNumber,
      endPageNumber: lastPage.pageNumber,
      ...aggregatePdfReadingProgress(segmentPages),
    };
  });
}

export function createPdfReadingMapVisuals(
  items: PdfReadingProgressMetrics[],
): PdfReadingMapVisual[] {
  const wordReference = percentile(
    items.map((item) => item.totalWords).filter((value) => value > 0),
    0.9,
  );
  const timeReference = percentile(
    items.map((item) => item.effectiveReadingMs).filter((value) => value > 0),
    0.9,
  );
  const paceValues = items
    .map((item) => item.wordsPerMinute)
    .filter((value): value is number => Number.isFinite(value));
  const paceFloor = percentile(paceValues, 0.1);
  const paceCeiling = percentile(paceValues, 0.9);

  return items.map((item) => {
    const evidence = getPdfReadingMapEvidence(item);
    const coverageRatio = clamp(item.coverageRatio ?? 0);
    const textRatio = item.totalWords <= 0
      ? 0.16
      : 0.36 + (Math.sqrt(clamp(item.totalWords / wordReference)) * 0.64);
    const normalizedTime = item.effectiveReadingMs <= 0
      ? 0
      : Math.sqrt(clamp(item.effectiveReadingMs / timeReference));
    const timeLevel = normalizedTime <= 0
      ? 0
      : Math.min(4, Math.max(1, Math.ceil(normalizedTime * 4))) as 1 | 2 | 3 | 4;

    return {
      coverageRatio,
      evidence,
      textRatio,
      timeLevel,
      ...(item.wordsPerMinute === undefined
        ? {}
        : {
            paceRatio: paceCeiling > paceFloor
              ? clamp((item.wordsPerMinute - paceFloor) / (paceCeiling - paceFloor))
              : 0.5,
          }),
    };
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

export function getPdfReadingMapEvidence(
  item: PdfReadingProgressMetrics,
): PdfReadingMapEvidence {
  if (item.totalWords <= 0) return 'no-text';
  if (
    item.coveredWords <= 0
    && item.processedWords <= 0
    && item.effectiveReadingMs <= 0
  ) {
    return 'unrecorded';
  }
  return 'measured';
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 1;

  const sorted = [...values].sort((left, right) => left - right);
  const position = clamp(percentileValue) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex]!;
  const upper = sorted[upperIndex]!;

  return lower + ((upper - lower) * (position - lowerIndex));
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
