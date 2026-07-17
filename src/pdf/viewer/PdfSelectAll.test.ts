import type { PdfPageTextRuns } from '@embedpdf/models';
import { describe, expect, it } from 'vitest';

import { createPdfSelectAllRects } from './PdfSelectAll';

describe('PDF select all', () => {
  it('keeps visible text rectangles inside the page bounds', () => {
    const textRuns = {
      runs: [
        {
          text: 'Visible text',
          rect: {
            origin: { x: -5, y: -2 },
            size: { width: 20, height: 12 },
          },
          charCount: 12,
          fontSize: 10,
        },
        {
          text: ' \n ',
          rect: {
            origin: { x: 20, y: 20 },
            size: { width: 10, height: 10 },
          },
          charCount: 3,
          fontSize: 10,
        },
        {
          text: 'Outside',
          rect: {
            origin: { x: 110, y: 20 },
            size: { width: 10, height: 10 },
          },
          charCount: 7,
          fontSize: 10,
        },
      ],
    } as PdfPageTextRuns;

    expect(createPdfSelectAllRects(textRuns, {
      width: 100,
      height: 100,
    })).toEqual([
      {
        origin: { x: 0, y: 0 },
        size: { width: 15, height: 10 },
      },
    ]);
  });
});
