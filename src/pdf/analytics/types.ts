import type {
  PdfPageObject,
  PdfPageTextRuns,
  Rect,
  Rotation,
  Size,
} from '@embedpdf/models';

import type {
  PageSnapshot,
  TextChunkSnapshot,
} from '../../domain/events';
import type { PdfSourceMetadata } from '../source';

export interface PdfReadingTextChunk extends TextChunkSnapshot {
  sectionId: string;
  text: string;
  pageIndex: number;
  pageNumber: number;
  rects: Rect[];
}

export interface PdfReadingTextSection {
  sectionId: string;
  pageIndex: number;
  pageNumber: number;
  objectNumber: number;
  size: Size;
  rotation: Rotation;
  wordCount: number;
  chunks: PdfReadingTextChunk[];
}

export interface PdfReadingSnapshot {
  page: PageSnapshot;
  sections: PdfReadingTextSection[];
  chunks: PdfReadingTextChunk[];
}

export type PdfReadingSnapshotLoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: PdfReadingSnapshot }
  | { status: 'error' };

export interface CreatePdfReadingTextSectionInput {
  metadata: PdfSourceMetadata;
  pageId: string;
  page: PdfPageObject;
  textRuns: PdfPageTextRuns;
}
