import type {
  Rect,
  Rotation,
  Size,
} from '@embedpdf/models';

import type { TextChunkRecord } from '../../storage/schema';
import type { PdfReadingSnapshot } from './types';

export const PDF_READING_SPEED_MIN_EFFECTIVE_MS = 30_000;
export const PDF_READING_SPEED_MIN_PROCESSED_WORDS = 100;

export interface PdfReadingProgressMetrics {
  totalWords: number;
  coveredWords: number;
  processedWords: number;
  effectiveReadingMs: number;
  rawExposureMs: number;
  coverageRatio?: number;
  wordsPerMinute?: number;
  confidence?: number;
}

export interface PdfChunkReadingProgress {
  chunkId: string;
  sectionId: string;
  pageIndex: number;
  pageNumber: number;
  wordCount: number;
  coveredWords: number;
  rects: Rect[];
}

export interface PdfPageReadingProgress extends PdfReadingProgressMetrics {
  sectionId: string;
  pageIndex: number;
  pageNumber: number;
  rotation: Rotation;
  size: Size;
  chunks: PdfChunkReadingProgress[];
}

export interface PdfDocumentReadingProgress extends PdfReadingProgressMetrics {
  pageId: string;
  resourceId: string;
  pages: PdfPageReadingProgress[];
}

interface WeightedConfidence {
  total: number;
  weight: number;
}

export function createPdfDocumentReadingProgress(
  snapshot: PdfReadingSnapshot,
  records: TextChunkRecord[],
): PdfDocumentReadingProgress {
  const recordsByChunkId = new Map(
    records
      .filter((record) => record.pageId === snapshot.page.pageId)
      .map((record) => [record.chunkId, record] as const),
  );
  const pages = snapshot.sections.map((section): PdfPageReadingProgress => {
    let coveredWords = 0;
    let processedWords = 0;
    let effectiveReadingMs = 0;
    let rawExposureMs = 0;
    const confidence: WeightedConfidence = { total: 0, weight: 0 };

    const chunks = section.chunks.map((chunk): PdfChunkReadingProgress => {
      const record = recordsByChunkId.get(chunk.chunkId);
      const chunkCoveredWords = Math.min(
        chunk.wordCount,
        finiteNonNegative(record?.effectiveWords),
      );

      if (!record) {
        return {
          chunkId: chunk.chunkId,
          sectionId: chunk.sectionId,
          pageIndex: chunk.pageIndex,
          pageNumber: chunk.pageNumber,
          wordCount: chunk.wordCount,
          coveredWords: chunkCoveredWords,
          rects: chunk.rects,
        };
      }

      const chunkProcessedWords = Math.max(
        chunkCoveredWords,
        finiteNonNegative(record.newWords ?? chunkCoveredWords)
          + finiteNonNegative(record.reviewWords),
      );
      const chunkEffectiveReadingMs = finiteNonNegative(record.effectiveReadingMs);

      coveredWords += chunkCoveredWords;
      processedWords += chunkProcessedWords;
      effectiveReadingMs += chunkEffectiveReadingMs;
      rawExposureMs += finiteNonNegative(
        record.rawExposureMs ?? record.exposureSeconds * 1_000,
      );
      addConfidence(
        confidence,
        record.confidence,
        chunkProcessedWords || chunkEffectiveReadingMs,
      );

      return {
        chunkId: chunk.chunkId,
        sectionId: chunk.sectionId,
        pageIndex: chunk.pageIndex,
        pageNumber: chunk.pageNumber,
        wordCount: chunk.wordCount,
        coveredWords: chunkCoveredWords,
        rects: chunk.rects,
      };
    });

    return createProgressMetrics({
      totalWords: section.wordCount,
      coveredWords,
      processedWords,
      effectiveReadingMs,
      rawExposureMs,
      confidence,
      pageIndex: section.pageIndex,
      pageNumber: section.pageNumber,
      sectionId: section.sectionId,
      rotation: section.rotation,
      size: section.size,
      chunks,
    });
  });
  const aggregate = aggregatePdfReadingProgress(pages);

  return {
    pageId: snapshot.page.pageId,
    resourceId: snapshot.page.resourceId ?? '',
    pages,
    ...aggregate,
  };
}

export function aggregatePdfReadingProgress(
  pages: PdfReadingProgressMetrics[],
): PdfReadingProgressMetrics {
  const confidence: WeightedConfidence = { total: 0, weight: 0 };
  let totalWords = 0;
  let coveredWords = 0;
  let processedWords = 0;
  let effectiveReadingMs = 0;
  let rawExposureMs = 0;

  for (const page of pages) {
    totalWords += finiteNonNegative(page.totalWords);
    coveredWords += finiteNonNegative(page.coveredWords);
    processedWords += finiteNonNegative(page.processedWords);
    effectiveReadingMs += finiteNonNegative(page.effectiveReadingMs);
    rawExposureMs += finiteNonNegative(page.rawExposureMs);
    addConfidence(
      confidence,
      page.confidence,
      page.processedWords || page.effectiveReadingMs,
    );
  }

  return createProgressMetrics({
    totalWords,
    coveredWords,
    processedWords,
    effectiveReadingMs,
    rawExposureMs,
    confidence,
  });
}

function createProgressMetrics<T extends {
  totalWords: number;
  coveredWords: number;
  processedWords: number;
  effectiveReadingMs: number;
  rawExposureMs: number;
  confidence: WeightedConfidence;
}>(
  input: T,
): Omit<T, 'confidence'> & PdfReadingProgressMetrics {
  const totalWords = finiteNonNegative(input.totalWords);
  const coveredWords = Math.min(totalWords, finiteNonNegative(input.coveredWords));
  const processedWords = finiteNonNegative(input.processedWords);
  const effectiveReadingMs = finiteNonNegative(input.effectiveReadingMs);
  const rawExposureMs = finiteNonNegative(input.rawExposureMs);
  const wordsPerMinute = effectiveReadingMs >= PDF_READING_SPEED_MIN_EFFECTIVE_MS
    && processedWords >= PDF_READING_SPEED_MIN_PROCESSED_WORDS
    ? processedWords / (effectiveReadingMs / 60_000)
    : undefined;
  const {
    confidence: _confidence,
    ...rest
  } = input;

  return {
    ...rest,
    totalWords,
    coveredWords,
    processedWords,
    effectiveReadingMs,
    rawExposureMs,
    ...(totalWords > 0 ? { coverageRatio: coveredWords / totalWords } : {}),
    ...(wordsPerMinute === undefined ? {} : { wordsPerMinute }),
    ...(input.confidence.weight > 0
      ? { confidence: input.confidence.total / input.confidence.weight }
      : {}),
  };
}

function addConfidence(
  aggregate: WeightedConfidence,
  value: number | undefined,
  weight: number,
): void {
  if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) {
    return;
  }

  const normalized = Math.min(1, Math.max(0, value ?? 0));
  aggregate.total += normalized * weight;
  aggregate.weight += weight;
}

function finiteNonNegative(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}
