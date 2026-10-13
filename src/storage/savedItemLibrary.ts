import { normalizeHttpUrl } from './savedItemNormalization';
import {
  db,
  type PdfAnnotationRecord,
  type SavedItemRecord,
} from './schema';

export interface SavedItemLibraryItem {
  id: string;
  text: string;
  type: SavedItemRecord['type'];
  sourceKind: 'web' | 'pdf';
  sourceDomain: string;
  sourceUrl?: string;
  sourceTitle?: string;
  note?: string;
  userTags: string[];
  pdfAnchor?: {
    annotationId: string;
    resourceId: string;
    pageIndex: number;
    pageCoordinates?: {
      x: number;
      y: number;
    };
  };
  createdAt: number;
  updatedAt: number;
}

export interface SavedItemLibraryStore {
  savedItems: {
    orderBy(index: 'createdAt'): {
      reverse(): {
        toArray(): Promise<SavedItemRecord[]>;
      };
    };
  };
  pdfAnnotations: {
    bulkGet(ids: string[]): Promise<Array<PdfAnnotationRecord | undefined>>;
  };
}

export async function getSavedItemLibrary(
  store: SavedItemLibraryStore = db,
): Promise<SavedItemLibraryItem[]> {
  const records = await store.savedItems.orderBy('createdAt').reverse().toArray();
  const annotationIds = Array.from(new Set(
    records.flatMap((record) => record.pdfAnnotationId ? [record.pdfAnnotationId] : []),
  ));
  const annotations = annotationIds.length > 0
    ? await store.pdfAnnotations.bulkGet(annotationIds)
    : [];
  const annotationsById = new Map(
    annotations.flatMap((annotation) => annotation ? [[annotation.id, annotation] as const] : []),
  );

  return records.flatMap((record) => {
    const text = normalizeInlineText(record.text);
    if (!text) return [];

    const annotation = record.pdfAnnotationId
      ? annotationsById.get(record.pdfAnnotationId)
      : undefined;
    const firstRect = annotation?.sourceRects.find(
      (rect) => rect.pageIndex === annotation.pageIndex && isValidSourceRect(rect),
    ) ?? annotation?.sourceRects.find(isValidSourceRect);
    const sourceKind = record.tags.includes('pdf') || record.pdfAnnotationId
      ? 'pdf'
      : 'web';
    const sourceUrl = normalizeHttpUrl(record.sourceUrl);
    const sourceTitle = normalizeInlineText(record.sourceTitle);
    const note = normalizeNote(record.note);

    return [{
      id: record.id,
      text,
      type: record.type,
      sourceKind,
      sourceDomain: normalizeDisplayText(record.sourceDomain) || 'unknown',
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(sourceTitle ? { sourceTitle } : {}),
      ...(note ? { note } : {}),
      userTags: normalizeUserTags(record.userTags ?? []),
      ...(annotation ? {
        pdfAnchor: {
          annotationId: annotation.id,
          resourceId: annotation.resourceId,
          pageIndex: annotation.pageIndex,
          ...(firstRect ? {
            pageCoordinates: {
              x: firstRect.x,
              y: firstRect.y,
            },
          } : {}),
        },
      } : {}),
      createdAt: record.createdAt,
      updatedAt: Math.max(record.createdAt, record.updatedAt ?? record.createdAt),
    }];
  });
}

function normalizeInlineText(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizeDisplayText(value: string | undefined): string {
  return value?.trim() ?? '';
}

function normalizeNote(value: string | undefined): string {
  return value?.replace(/\r\n?/g, '\n').trim() ?? '';
}

function normalizeUserTags(tags: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const input of tags) {
    const tag = normalizeInlineText(input);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }
  return normalized;
}

function isValidSourceRect(rect: PdfAnnotationRecord['sourceRects'][number]): boolean {
  return (
    Number.isSafeInteger(rect.pageIndex)
    && rect.pageIndex >= 0
    && Number.isFinite(rect.x)
    && rect.x >= 0
    && Number.isFinite(rect.y)
    && rect.y >= 0
    && Number.isFinite(rect.width)
    && rect.width > 0
    && Number.isFinite(rect.height)
    && rect.height > 0
  );
}
