import {
  PdfErrorCode,
  type PdfDocumentObject,
  type PdfEngine,
  type PdfPageTextRuns,
  type PdfTask,
} from '@embedpdf/models';

import type { PdfSourceMetadata } from '../source';
import {
  createPdfReadingPageId,
  createPdfReadingSnapshot,
} from './identity';
import { createPdfReadingTextSection } from './textModel';
import type {
  PdfReadingSnapshot,
  PdfReadingTextSection,
} from './types';

export type PdfTextRunsEngine = Pick<PdfEngine, 'getPageTextRuns'>;

export interface PdfTextExtractionProgress {
  completedPages: number;
  totalPages: number;
  pageNumber: number;
  section: PdfReadingTextSection;
}

export interface PdfTextExtractionOptions {
  signal?: AbortSignal;
  capturedAt?: number;
  onProgress?: (progress: PdfTextExtractionProgress) => void;
}

const EXTRACTION_ABORT_MESSAGE = 'PDF text extraction was aborted.';

export async function extractPdfReadingSnapshot(
  engine: PdfTextRunsEngine,
  document: PdfDocumentObject,
  metadata: PdfSourceMetadata,
  options: PdfTextExtractionOptions = {},
): Promise<PdfReadingSnapshot> {
  if (document.id !== metadata.resourceId) {
    throw new RangeError('PDF source metadata must match the opened document ID.');
  }

  const pageId = createPdfReadingPageId(metadata);
  const sections: PdfReadingTextSection[] = [];

  for (const page of document.pages) {
    throwIfAborted(options.signal);
    const textRuns = await getPageTextRuns(
      engine.getPageTextRuns(document, page),
      options.signal,
    );
    throwIfAborted(options.signal);

    const section = createPdfReadingTextSection({
      metadata,
      pageId,
      page,
      textRuns,
    });
    sections.push(section);
    options.onProgress?.({
      completedPages: sections.length,
      totalPages: document.pageCount,
      pageNumber: page.index + 1,
      section,
    });
  }

  return createPdfReadingSnapshot(
    metadata,
    sections,
    options.capturedAt ?? Date.now(),
  );
}

async function getPageTextRuns(
  task: PdfTask<PdfPageTextRuns>,
  signal?: AbortSignal,
): Promise<PdfPageTextRuns> {
  const abortTask = () => {
    task.abort({
      code: PdfErrorCode.Unknown,
      message: EXTRACTION_ABORT_MESSAGE,
    });
  };
  signal?.addEventListener('abort', abortTask, { once: true });

  try {
    return await task.toPromise();
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortTask);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error(EXTRACTION_ABORT_MESSAGE);
  error.name = 'AbortError';
  return error;
}
