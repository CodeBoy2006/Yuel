import type { Position, SearchResult } from '@embedpdf/models';

export interface PdfSearchResultHit {
  index: number;
  result: SearchResult;
}

export interface PdfSearchResultGroup {
  pageIndex: number;
  hits: PdfSearchResultHit[];
}

export function groupPdfSearchResults(
  results: SearchResult[],
): PdfSearchResultGroup[] {
  const groupsByPage = new Map<number, PdfSearchResultGroup>();

  results.forEach((result, index) => {
    let group = groupsByPage.get(result.pageIndex);
    if (!group) {
      group = {
        pageIndex: result.pageIndex,
        hits: [],
      };
      groupsByPage.set(result.pageIndex, group);
    }

    group.hits.push({ index, result });
  });

  return Array.from(groupsByPage.values());
}

export function getPdfSearchResultAnchor(
  result: SearchResult,
): Position | undefined {
  if (result.rects.length === 0) return undefined;

  return result.rects.reduce<Position>(
    (anchor, rect) => ({
      x: Math.min(anchor.x, rect.origin.x),
      y: Math.min(anchor.y, rect.origin.y),
    }),
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );
}
