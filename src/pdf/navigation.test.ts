import { describe, expect, it } from 'vitest';

import {
  createPdfReaderUrl,
  parsePdfReaderTarget,
} from './navigation';

const resourceId = `pdf_${'a'.repeat(64)}`;
const annotationId = 'pdf_annotation_saved_anchor';

describe('PDF reader navigation targets', () => {
  it('serializes a precise PDF location without exposing selected text', () => {
    const url = createPdfReaderUrl('chrome-extension://yuel/dashboard.html', {
      resourceId,
      pageIndex: 2,
      annotationId,
      pageCoordinates: {
        x: 72.12345,
        y: 184.98765,
      },
    });

    expect(url).toBe(
      `chrome-extension://yuel/pdf-reader.html?resource=${resourceId}&page=3&annotation=${annotationId}&x=72.123&y=184.988`,
    );
  });

  it('parses page-only and precise targets', () => {
    expect(parsePdfReaderTarget(`?resource=${resourceId}&page=4`)).toEqual({
      resourceId,
      pageIndex: 3,
    });
    expect(parsePdfReaderTarget(
      `?resource=${resourceId}&page=4&annotation=${annotationId}&x=12.5&y=90`,
    )).toEqual({
      resourceId,
      pageIndex: 3,
      annotationId,
      pageCoordinates: {
        x: 12.5,
        y: 90,
      },
    });
  });

  it.each([
    '',
    '?resource=pdf_invalid&page=1',
    `?resource=${resourceId}&page=0`,
    `?resource=${resourceId}&page=nope`,
    `?resource=${resourceId}&page=1abc`,
    `?resource=${resourceId}&page=1.5`,
  ])('ignores malformed launch targets: %s', (search) => {
    expect(parsePdfReaderTarget(search)).toBeUndefined();
  });

  it('drops incomplete or invalid coordinates while preserving the page target', () => {
    expect(parsePdfReaderTarget(`?resource=${resourceId}&page=2&x=-1&y=10`)).toEqual({
      resourceId,
      pageIndex: 1,
    });
    expect(parsePdfReaderTarget(`?resource=${resourceId}&page=2&x=5`)).toEqual({
      resourceId,
      pageIndex: 1,
    });
  });

  it('drops an invalid annotation ID while preserving the source location', () => {
    expect(parsePdfReaderTarget(
      `?resource=${resourceId}&page=2&annotation=../../saved&x=5&y=10`,
    )).toEqual({
      resourceId,
      pageIndex: 1,
      pageCoordinates: { x: 5, y: 10 },
    });
  });

  it('rejects invalid annotation IDs when creating a reader URL', () => {
    expect(() => createPdfReaderUrl('chrome-extension://yuel/dashboard.html', {
      resourceId,
      pageIndex: 0,
      annotationId: 'annotation-pdf',
    })).toThrow('valid PDF annotation ID');
  });
});
