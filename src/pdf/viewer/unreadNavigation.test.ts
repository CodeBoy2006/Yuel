import { describe, expect, it } from 'vitest';
import { Rotation } from '@embedpdf/models';

import type {
  PdfChunkReadingProgress,
  PdfDocumentReadingProgress,
  PdfPageReadingProgress,
} from '../analytics/progress';
import {
  findNextUnreadPdfChunk,
  isPdfChunkUnread,
} from './unreadNavigation';

describe('PDF next unread navigation', () => {
  it('uses the 90 percent completion boundary', () => {
    expect(isPdfChunkUnread(createChunk('partial', 100, 89))).toBe(true);
    expect(isPdfChunkUnread(createChunk('complete', 100, 90))).toBe(false);
    expect(isPdfChunkUnread(createChunk('over-read', 100, 120))).toBe(false);
    expect(isPdfChunkUnread(createChunk('empty', 0, 0))).toBe(false);
  });

  it('starts at the visible reading line and continues on later pages', () => {
    const progress = createProgress([
      createPage(1, [
        createChunk('above', 20, 0, 1, 80),
        createChunk('visible', 20, 0, 1, 260),
      ]),
      createPage(2, [
        createChunk('later', 20, 0, 2, 120),
      ]),
    ]);

    expect(findNextUnreadPdfChunk(progress, {
      pageNumber: 1,
      pageY: 200,
    })?.chunkId).toBe('visible');
    expect(findNextUnreadPdfChunk(progress, {
      pageNumber: 1,
      pageY: 700,
    })?.chunkId).toBe('later');
  });

  it.each([
    ['90 degrees', Rotation.Degree90, 40, 260],
    ['270 degrees', Rotation.Degree270, 500, 260],
  ])(
    'uses the displayed vertical axis at %s rotation',
    (_label, documentRotation, aboveX, visibleX) => {
      const progress = createProgress([
        createPage(1, [
          createChunk('above', 20, 0, 1, 80, aboveX, 60),
          createChunk('visible', 20, 0, 1, 80, visibleX, 60),
        ]),
      ]);

      expect(findNextUnreadPdfChunk(progress, {
        pageNumber: 1,
        pageY: 200,
        documentRotation,
      })?.chunkId).toBe('visible');
    },
  );

  it.each([
    {
      label: '90 degrees',
      pageRotation: Rotation.Degree0,
      documentRotation: Rotation.Degree90,
      far: { x: 480, y: 80 },
      near: { x: 240, y: 80 },
    },
    {
      label: '180 degrees from combined rotations',
      pageRotation: Rotation.Degree90,
      documentRotation: Rotation.Degree90,
      far: { x: 72, y: 80 },
      near: { x: 72, y: 500 },
    },
    {
      label: '270 degrees',
      pageRotation: Rotation.Degree0,
      documentRotation: Rotation.Degree270,
      far: { x: 60, y: 80 },
      near: { x: 300, y: 80 },
    },
  ])(
    'selects the nearest displayed unread chunk at $label',
    ({
      documentRotation,
      far,
      near,
      pageRotation,
    }) => {
      const progress = createProgress([
        createPage(1, [
          createChunk('far', 20, 0, 1, far.y, far.x, 60),
          createChunk('near', 20, 0, 1, near.y, near.x, 60),
        ], pageRotation),
      ]);

      expect(findNextUnreadPdfChunk(progress, {
        pageNumber: 1,
        pageY: 200,
        documentRotation,
      })?.chunkId).toBe('near');
      expect(findNextUnreadPdfChunk(progress, {
        pageNumber: 1,
        afterChunkId: 'near',
        documentRotation,
      })?.chunkId).toBe('far');
    },
  );

  it('advances past the previous target without wrapping', () => {
    const progress = createProgress([
      createPage(1, [
        createChunk('first', 20, 0, 1, 80),
        createChunk('second', 20, 0, 1, 260),
      ]),
      createPage(2, [
        createChunk('done', 20, 20, 2, 120),
      ]),
    ]);

    expect(findNextUnreadPdfChunk(progress, {
      pageNumber: 1,
      afterChunkId: 'first',
    })?.chunkId).toBe('second');
    expect(findNextUnreadPdfChunk(progress, {
      pageNumber: 1,
      afterChunkId: 'second',
    })).toBeUndefined();
  });

  it('uses page-top navigation for geometry-free chunks on later pages', () => {
    const progress = createProgress([
      createPage(1, [
        createChunk('behind-without-geometry', 20, 0, 1),
      ]),
      createPage(2, [
        createChunk('page-fallback', 20, 0, 2),
      ]),
    ]);

    expect(findNextUnreadPdfChunk(progress, {
      pageNumber: 1,
      pageY: 100,
    })).toMatchObject({
      chunkId: 'page-fallback',
      pageNumber: 2,
    });
    expect(findNextUnreadPdfChunk(progress, {
      pageNumber: 1,
      pageY: 100,
    })?.pageCoordinates).toBeUndefined();
  });
});

function createProgress(
  pages: PdfPageReadingProgress[],
): PdfDocumentReadingProgress {
  const totalWords = pages.reduce((total, page) => total + page.totalWords, 0);
  const coveredWords = pages.reduce((total, page) => total + page.coveredWords, 0);

  return {
    pageId: 'pdf-page',
    resourceId: 'pdf-resource',
    pages,
    totalWords,
    coveredWords,
    processedWords: coveredWords,
    effectiveReadingMs: 0,
    rawExposureMs: 0,
    coverageRatio: totalWords > 0 ? coveredWords / totalWords : undefined,
  };
}

function createPage(
  pageNumber: number,
  chunks: PdfChunkReadingProgress[],
  rotation = Rotation.Degree0,
): PdfPageReadingProgress {
  const totalWords = chunks.reduce((total, chunk) => total + chunk.wordCount, 0);
  const coveredWords = chunks.reduce((total, chunk) => total + chunk.coveredWords, 0);

  return {
    sectionId: `section-${pageNumber}`,
    pageIndex: pageNumber - 1,
    pageNumber,
    size: { width: 600, height: 800 },
    rotation,
    chunks,
    totalWords,
    coveredWords,
    processedWords: coveredWords,
    effectiveReadingMs: 0,
    rawExposureMs: 0,
    coverageRatio: totalWords > 0 ? coveredWords / totalWords : undefined,
  };
}

function createChunk(
  chunkId: string,
  wordCount: number,
  coveredWords: number,
  pageNumber = 1,
  y?: number,
  x = 72,
  width = 240,
): PdfChunkReadingProgress {
  return {
    chunkId,
    sectionId: `section-${pageNumber}`,
    pageIndex: pageNumber - 1,
    pageNumber,
    wordCount,
    coveredWords,
    rects: y === undefined
      ? []
      : [{
          origin: { x, y },
          size: { width, height: 18 },
        }],
  };
}
