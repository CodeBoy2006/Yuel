import type { SearchResult } from '@embedpdf/models';
import { describe, expect, it } from 'vitest';

import {
  getPdfSearchResultAnchor,
  groupPdfSearchResults,
} from './searchResults';

function createResult(
  pageIndex: number,
  x: number,
  y: number,
): SearchResult {
  return {
    pageIndex,
    charIndex: 0,
    charCount: 4,
    context: {
      before: '',
      match: 'Yuel',
      after: '',
      truncatedLeft: false,
      truncatedRight: false,
    },
    rects: [{
      origin: { x, y },
      size: { width: 20, height: 10 },
    }],
  };
}

describe('PDF search result helpers', () => {
  it('groups results by page while retaining global indices', () => {
    const groups = groupPdfSearchResults([
      createResult(0, 10, 20),
      createResult(2, 50, 60),
      createResult(0, 30, 40),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.pageIndex).toBe(0);
    expect(groups[0]?.hits.map((hit) => hit.index)).toEqual([0, 2]);
    expect(groups[1]?.pageIndex).toBe(2);
    expect(groups[1]?.hits.map((hit) => hit.index)).toEqual([1]);
  });

  it('uses the upper-left extent of all result rectangles as the scroll anchor', () => {
    const result = createResult(1, 40, 70);
    result.rects.push({
      origin: { x: 12, y: 80 },
      size: { width: 14, height: 10 },
    });
    result.rects.push({
      origin: { x: 30, y: 18 },
      size: { width: 14, height: 10 },
    });

    expect(getPdfSearchResultAnchor(result)).toEqual({ x: 12, y: 18 });
    expect(getPdfSearchResultAnchor({ ...result, rects: [] })).toBeUndefined();
  });
});
