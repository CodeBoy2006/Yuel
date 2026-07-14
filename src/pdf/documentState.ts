import {
  restorePosition,
  transformSize,
  type Rotation,
} from '@embedpdf/models';
import type { ScrollStrategy } from '@embedpdf/plugin-scroll';
import type { ZoomLevel } from '@embedpdf/plugin-zoom';

import {
  db,
  type PdfDocumentStateRecord,
  type PdfReaderScrollStrategy,
  type PdfReaderZoomLevel,
} from '../storage/schema';
import type { PdfSourceMetadata } from './source';

export const RECENT_PDF_DOCUMENT_LIMIT = 5;

export interface PdfDocumentViewState {
  pageIndex: number;
  pageCoordinates?: {
    x: number;
    y: number;
  };
  zoomLevel: ZoomLevel;
  scrollStrategy: ScrollStrategy;
  rotation: Rotation;
  isPanMode: boolean;
}

interface PdfDocumentStateTable {
  get(resourceId: string): Promise<PdfDocumentStateRecord | undefined>;
  put(record: PdfDocumentStateRecord): Promise<unknown>;
  update(resourceId: string, changes: Partial<PdfDocumentStateRecord>): Promise<number>;
  orderBy(index: 'lastOpenedAt'): {
    reverse(): {
      limit(count: number): {
        toArray(): Promise<PdfDocumentStateRecord[]>;
      };
    };
  };
}

export async function recordPdfDocumentOpen(
  metadata: PdfSourceMetadata,
  table: PdfDocumentStateTable = db.pdfDocumentStates,
  openedAt = Date.now(),
): Promise<PdfDocumentStateRecord> {
  const existing = await table.get(metadata.resourceId);
  const record: PdfDocumentStateRecord = {
    resourceId: metadata.resourceId,
    sha256: metadata.sha256,
    kind: metadata.kind,
    displayName: metadata.displayName,
    byteLength: metadata.byteLength,
    mediaType: metadata.mediaType,
    ...(metadata.origin ? { origin: metadata.origin } : {}),
    ...(metadata.sourceUrl ? { sourceUrl: metadata.sourceUrl } : {}),
    pageIndex: normalizePageIndex(existing?.pageIndex),
    ...(existing?.pageCoordinates
      ? { pageCoordinates: normalizePageCoordinates(existing.pageCoordinates) }
      : {}),
    zoomLevel: normalizeZoomLevel(existing?.zoomLevel),
    scrollStrategy: normalizeScrollStrategy(existing?.scrollStrategy),
    rotation: normalizeRotation(existing?.rotation),
    isPanMode: existing?.isPanMode ?? false,
    lastOpenedAt: Math.max(existing?.lastOpenedAt ?? 0, openedAt),
    updatedAt: Math.max(existing?.updatedAt ?? 0, openedAt),
  };

  await table.put(record);
  return record;
}

export async function savePdfDocumentViewState(
  resourceId: string,
  viewState: PdfDocumentViewState,
  table: PdfDocumentStateTable = db.pdfDocumentStates,
  updatedAt = Date.now(),
): Promise<boolean> {
  const changes: Partial<PdfDocumentStateRecord> = {
    pageIndex: normalizePageIndex(viewState.pageIndex),
    zoomLevel: normalizeZoomLevel(viewState.zoomLevel),
    scrollStrategy: normalizeScrollStrategy(viewState.scrollStrategy),
    rotation: normalizeRotation(viewState.rotation),
    isPanMode: viewState.isPanMode,
    pageCoordinates: normalizePageCoordinates(
      viewState.pageCoordinates ?? { x: 0, y: 0 },
    ),
    updatedAt,
  };

  return (await table.update(resourceId, changes)) > 0;
}

export async function getPdfDocumentState(
  resourceId: string,
  table: PdfDocumentStateTable = db.pdfDocumentStates,
): Promise<PdfDocumentStateRecord | undefined> {
  return table.get(resourceId);
}

export async function getRecentPdfDocumentStates(
  limit = RECENT_PDF_DOCUMENT_LIMIT,
  table: PdfDocumentStateTable = db.pdfDocumentStates,
): Promise<PdfDocumentStateRecord[]> {
  const normalizedLimit = Math.min(20, Math.max(1, Math.floor(limit)));
  return table.orderBy('lastOpenedAt').reverse().limit(normalizedLimit).toArray();
}

export function toPdfPageCoordinates(
  displayedCoordinates: { x: number; y: number },
  pageSize: { width: number; height: number },
  rotation: Rotation,
): { x: number; y: number } {
  const rotatedPageSize = transformSize(pageSize, rotation, 1);
  const position = restorePosition(
    rotatedPageSize,
    displayedCoordinates,
    rotation,
    1,
  );

  return {
    x: Math.min(pageSize.width, Math.max(0, position.x)),
    y: Math.min(pageSize.height, Math.max(0, position.y)),
  };
}

function normalizePageIndex(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0
    ? value!
    : 0;
}

function normalizePageCoordinates(
  coordinates: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: normalizeCoordinate(coordinates.x),
    y: normalizeCoordinate(coordinates.y),
  };
}

function normalizeCoordinate(value: number): number {
  return Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function normalizeZoomLevel(value: PdfReaderZoomLevel | ZoomLevel | undefined): PdfReaderZoomLevel {
  if (value === 'automatic' || value === 'fit-page' || value === 'fit-width') {
    return value;
  }
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 'fit-width';
}

function normalizeScrollStrategy(
  value: PdfReaderScrollStrategy | ScrollStrategy | undefined,
): PdfReaderScrollStrategy {
  return value === 'horizontal' ? 'horizontal' : 'vertical';
}

function normalizeRotation(value: number | undefined): 0 | 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3
    ? value
    : 0;
}
