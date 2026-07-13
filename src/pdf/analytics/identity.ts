import type { PdfPageObject } from '@embedpdf/models';

import { hashText } from '../../domain/events';
import { READING_METRIC_MODEL_VERSION } from '../../domain/metrics';
import type { PdfSourceMetadata } from '../source';
import type {
  PdfReadingSnapshot,
  PdfReadingTextSection,
} from './types';

export function createPdfReadingPageId(metadata: PdfSourceMetadata): string {
  return `${getPdfReadingDomain(metadata)}_${hashText(metadata.resourceId)}`;
}

export function createPdfReadingSectionId(
  resourceId: string,
  page: Pick<PdfPageObject, 'index' | 'objectNumber'>,
): string {
  const sectionHash = hashText(`${resourceId}\u0000${page.index}\u0000${page.objectNumber}`);
  return `${resourceId}_section_${sectionHash}`;
}

export function createPdfReadingSnapshot(
  metadata: PdfSourceMetadata,
  sections: PdfReadingTextSection[],
  capturedAt = Date.now(),
): PdfReadingSnapshot {
  const pageId = createPdfReadingPageId(metadata);
  const chunks = sections.flatMap((section) => section.chunks);

  if (chunks.some((chunk) => chunk.pageId !== pageId)) {
    throw new RangeError('PDF text sections must use the resource reading page ID.');
  }

  return {
    page: {
      pageId,
      domain: getPdfReadingDomain(metadata),
      resourceType: 'pdf',
      resourceId: metadata.resourceId,
      titleHash: hashText(metadata.displayName),
      urlHash: hashText(`${metadata.origin ?? 'local'}\u0000${metadata.resourceId}`),
      language: 'en',
      totalWords: chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0),
      metricModelVersion: READING_METRIC_MODEL_VERSION,
      capturedAt,
    },
    sections,
    chunks,
  };
}

export function getPdfReadingDomain(metadata: PdfSourceMetadata): string {
  if (metadata.kind === 'local') {
    return 'pdf.local';
  }

  try {
    const hostname = metadata.origin ? new URL(metadata.origin).hostname : '';
    return hostname.replace(/^www\./, '') || 'pdf.remote';
  } catch {
    return 'pdf.remote';
  }
}
