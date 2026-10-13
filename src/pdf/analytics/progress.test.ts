import { describe, expect, it } from 'vitest';

import type { TextChunkRecord } from '../../storage/schema';
import type { PdfReadingSnapshot } from './types';
import {
  aggregatePdfReadingProgress,
  createPdfDocumentReadingProgress,
} from './progress';

const snapshot: PdfReadingSnapshot = {
  page: {
    pageId: 'pdf-page',
    domain: 'pdf.local',
    resourceType: 'pdf',
    resourceId: 'pdf_resource',
    titleHash: 'title',
    urlHash: 'url',
    language: 'en',
    totalWords: 60,
    capturedAt: 1,
  },
  sections: [
    {
      sectionId: 'section-1',
      pageIndex: 0,
      pageNumber: 1,
      objectNumber: 10,
      size: { width: 600, height: 800 },
      rotation: 0,
      wordCount: 40,
      chunks: [
        createChunk('chunk-1', 'section-1', 0, 1, 20),
        createChunk('chunk-2', 'section-1', 0, 1, 20),
      ],
    },
    {
      sectionId: 'section-2',
      pageIndex: 1,
      pageNumber: 2,
      objectNumber: 11,
      size: { width: 600, height: 800 },
      rotation: 0,
      wordCount: 20,
      chunks: [
        createChunk('chunk-3', 'section-2', 1, 2, 20),
      ],
    },
    {
      sectionId: 'section-3',
      pageIndex: 2,
      pageNumber: 3,
      objectNumber: 12,
      size: { width: 600, height: 800 },
      rotation: 0,
      wordCount: 0,
      chunks: [],
    },
  ],
  chunks: [],
};
snapshot.chunks = snapshot.sections.flatMap((section) => section.chunks);

describe('PDF reading progress', () => {
  it('joins complete text sections with sparse stored reading metrics', () => {
    const records: TextChunkRecord[] = [
      createRecord('chunk-1', {
        effectiveWords: 20,
        newWords: 20,
        reviewWords: 80,
        effectiveReadingMs: 30_000,
        confidence: 0.8,
      }),
      createRecord('chunk-2', {
        effectiveWords: 8,
        newWords: 8,
        reviewWords: 12,
        effectiveReadingMs: 10_000,
        confidence: 0.5,
      }),
      createRecord('other-page', {
        pageId: 'different-page',
        effectiveWords: 100,
      }),
    ];

    const progress = createPdfDocumentReadingProgress(snapshot, records);

    expect(progress.pages).toHaveLength(3);
    expect(progress.pages[0]).toMatchObject({
      totalWords: 40,
      coveredWords: 28,
      processedWords: 120,
      effectiveReadingMs: 40_000,
      coverageRatio: 0.7,
      wordsPerMinute: 180,
    });
    expect(progress.pages[1]).toMatchObject({
      totalWords: 20,
      coveredWords: 0,
      processedWords: 0,
      effectiveReadingMs: 0,
      coverageRatio: 0,
    });
    expect(progress.pages[1].wordsPerMinute).toBeUndefined();
    expect(progress.pages[2].coverageRatio).toBeUndefined();
    expect(progress).toMatchObject({
      totalWords: 60,
      coveredWords: 28,
      processedWords: 120,
      effectiveReadingMs: 40_000,
      coverageRatio: 28 / 60,
      wordsPerMinute: 180,
    });
    expect(progress.confidence).toBeCloseTo((0.8 * 100 + 0.5 * 20) / 120);
  });

  it('caps coverage at chunk totals while retaining review work for speed', () => {
    const progress = createPdfDocumentReadingProgress(snapshot, [
      createRecord('chunk-1', {
        effectiveWords: 99,
        newWords: 20,
        reviewWords: 100,
        effectiveReadingMs: 30_000,
      }),
    ]);

    expect(progress.pages[0].coveredWords).toBe(20);
    expect(progress.pages[0].processedWords).toBe(120);
    expect(progress.pages[0].wordsPerMinute).toBe(240);
  });

  it('does not publish unstable speed from tiny samples', () => {
    const progress = aggregatePdfReadingProgress([{
      totalWords: 20,
      coveredWords: 5,
      processedWords: 99,
      effectiveReadingMs: 29_999,
      rawExposureMs: 7_000,
      coverageRatio: 0.25,
    }]);

    expect(progress.wordsPerMinute).toBeUndefined();
    expect(progress.coverageRatio).toBe(0.25);
  });
});

function createChunk(
  chunkId: string,
  sectionId: string,
  pageIndex: number,
  pageNumber: number,
  wordCount: number,
) {
  return {
    chunkId,
    pageId: 'pdf-page',
    sectionId,
    textHash: `${chunkId}-hash`,
    text: 'sample text',
    sourceKey: chunkId,
    wordCount,
    sentenceCount: 1,
    selector: chunkId,
    pageIndex,
    pageNumber,
    rects: [],
  };
}

function createRecord(
  chunkId: string,
  changes: Partial<TextChunkRecord>,
): TextChunkRecord {
  return {
    chunkId,
    pageId: 'pdf-page',
    sectionId: 'section-1',
    textHash: `${chunkId}-hash`,
    wordCount: 20,
    sentenceCount: 1,
    exposureSeconds: 0,
    effectiveWords: 0,
    ...changes,
  };
}
