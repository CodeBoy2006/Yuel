import { describe, expect, it, vi } from 'vitest';
import { Rotation } from '@embedpdf/models';
import { ScrollStrategy } from '@embedpdf/plugin-scroll';
import { ZoomMode } from '@embedpdf/plugin-zoom';

import type { PdfDocumentStateRecord } from '../storage/schema';
import type { PdfSourceMetadata } from './source';
import {
  getRecentPdfDocumentStates,
  recordPdfDocumentOpen,
  savePdfDocumentViewState,
  toPdfPageCoordinates,
} from './documentState';

const resourceId = `pdf_${'b'.repeat(64)}`;
const metadata: PdfSourceMetadata = {
  resourceId,
  sha256: 'b'.repeat(64),
  kind: 'remote',
  displayName: 'Reference.pdf',
  byteLength: 4_096,
  mediaType: 'application/pdf',
  origin: 'https://docs.example.com',
  sourceUrl: 'https://docs.example.com/reference.pdf',
};

function createTable(existing?: PdfDocumentStateRecord) {
  let stored = existing;
  const put = vi.fn(async (record: PdfDocumentStateRecord) => {
    stored = record;
  });
  const update = vi.fn(async (
    id: string,
    changes: Partial<PdfDocumentStateRecord>,
  ) => {
    if (!stored || id !== stored.resourceId) return 0;
    stored = { ...stored, ...changes };
    return 1;
  });
  const toArray = vi.fn(async () => stored ? [stored] : []);
  const limit = vi.fn(() => ({ toArray }));
  const reverse = vi.fn(() => ({ limit }));
  const orderBy = vi.fn(() => ({ reverse }));

  return {
    table: {
      get: vi.fn(async () => stored),
      put,
      update,
      orderBy,
    },
    get stored() {
      return stored;
    },
    limit,
    orderBy,
  };
}

describe('PDF document state storage', () => {
  it('records reopen metadata while preserving the previous reading position', async () => {
    const store = createTable({
      ...metadata,
      pageIndex: 7,
      pageCoordinates: { x: 12, y: 240 },
      zoomLevel: 1.35,
      scrollStrategy: 'vertical',
      rotation: 1,
      isPanMode: true,
      lastOpenedAt: 1_000,
      updatedAt: 1_100,
    });

    const record = await recordPdfDocumentOpen(metadata, store.table, 2_000);

    expect(record).toEqual({
      ...metadata,
      pageIndex: 7,
      pageCoordinates: { x: 12, y: 240 },
      zoomLevel: 1.35,
      scrollStrategy: 'vertical',
      rotation: 1,
      isPanMode: true,
      lastOpenedAt: 2_000,
      updatedAt: 2_000,
    });
    expect(store.stored).toEqual(record);
  });

  it('stores precise view state without creating an orphan document record', async () => {
    const store = createTable(await recordPdfDocumentOpen(
      metadata,
      createTable().table,
      1_000,
    ));

    await expect(savePdfDocumentViewState(resourceId, {
      pageIndex: 3,
      pageCoordinates: { x: 18.5, y: 320.25 },
      zoomLevel: ZoomMode.FitPage,
      scrollStrategy: ScrollStrategy.Horizontal,
      rotation: 2,
      isPanMode: true,
    }, store.table, 1_500)).resolves.toBe(true);

    expect(store.stored).toMatchObject({
      pageIndex: 3,
      pageCoordinates: { x: 18.5, y: 320.25 },
      zoomLevel: 'fit-page',
      scrollStrategy: 'horizontal',
      rotation: 2,
      isPanMode: true,
      updatedAt: 1_500,
    });

    await savePdfDocumentViewState(resourceId, {
      pageIndex: 4,
      zoomLevel: ZoomMode.FitWidth,
      scrollStrategy: ScrollStrategy.Vertical,
      rotation: 0,
      isPanMode: false,
    }, store.table, 1_600);
    expect(store.stored).toMatchObject({
      pageIndex: 4,
      pageCoordinates: { x: 0, y: 0 },
      updatedAt: 1_600,
    });

    const emptyStore = createTable();
    await expect(savePdfDocumentViewState(resourceId, {
      pageIndex: 1,
      zoomLevel: ZoomMode.FitWidth,
      scrollStrategy: ScrollStrategy.Vertical,
      rotation: 0,
      isPanMode: false,
    }, emptyStore.table)).resolves.toBe(false);
  });

  it('loads a bounded recent-document list by last-opened time', async () => {
    const store = createTable(await recordPdfDocumentOpen(
      metadata,
      createTable().table,
      1_000,
    ));

    await getRecentPdfDocumentStates(99, store.table);

    expect(store.orderBy).toHaveBeenCalledWith('lastOpenedAt');
    expect(store.limit).toHaveBeenCalledWith(20);
  });

  it('converts rotated viewport offsets back to original PDF page coordinates', () => {
    expect(toPdfPageCoordinates(
      { x: 72, y: 144 },
      { width: 612, height: 792 },
      Rotation.Degree90,
    )).toEqual({
      x: 144,
      y: 720,
    });
    expect(toPdfPageCoordinates(
      { x: 18.5, y: 320.25 },
      { width: 612, height: 792 },
      Rotation.Degree0,
    )).toEqual({
      x: 18.5,
      y: 320.25,
    });
  });
});
