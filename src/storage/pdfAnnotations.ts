import {
  db,
  type PdfAnnotationRecord,
  type PdfHighlightColor,
  type PdfSourceRectRecord,
  type SavedItemRecord,
} from './schema';

export const PDF_HIGHLIGHT_COLORS = [
  'yellow',
  'green',
  'blue',
  'rose',
] as const satisfies readonly PdfHighlightColor[];

export interface PdfBacklinkTarget {
  annotationId: string;
  resourceId: string;
  pageIndex: number;
}

interface PdfAnnotationTable {
  get(id: string): Promise<PdfAnnotationRecord | undefined>;
}

export interface PdfStoredHighlight {
  annotation: PdfAnnotationRecord;
  color: PdfHighlightColor;
  savedItem: SavedItemRecord;
}

export interface PdfHighlightStore {
  pdfAnnotations: {
    where(index: 'resourceId'): {
      equals(resourceId: string): {
        toArray(): Promise<PdfAnnotationRecord[]>;
      };
    };
  };
  savedItems: {
    where(index: 'pdfAnnotationId'): {
      anyOf(annotationIds: string[]): {
        toArray(): Promise<SavedItemRecord[]>;
      };
    };
  };
}

export async function getPdfHighlightsForResource(
  resourceId: string,
  store: PdfHighlightStore = db,
): Promise<PdfStoredHighlight[]> {
  const normalizedResourceId = resourceId.trim();
  if (!normalizedResourceId) return [];

  const annotations = (await store.pdfAnnotations
    .where('resourceId')
    .equals(normalizedResourceId)
    .toArray())
    .filter((annotation) => annotation.resourceId === normalizedResourceId);
  if (annotations.length === 0) return [];

  const annotationIds = annotations.map((annotation) => annotation.id);
  const savedItems = await store.savedItems
    .where('pdfAnnotationId')
    .anyOf(annotationIds)
    .toArray();
  const savedItemsByAnnotationId = new Map<string, SavedItemRecord>();
  for (const savedItem of savedItems) {
    const annotationId = savedItem.pdfAnnotationId;
    if (!annotationId) continue;

    const existing = savedItemsByAnnotationId.get(annotationId);
    const savedItemUpdatedAt = savedItem.updatedAt ?? savedItem.createdAt;
    const existingUpdatedAt = existing
      ? existing.updatedAt ?? existing.createdAt
      : -1;
    if (!existing || savedItemUpdatedAt >= existingUpdatedAt) {
      savedItemsByAnnotationId.set(annotationId, savedItem);
    }
  }

  return annotations.flatMap((annotation) => {
    const savedItem = savedItemsByAnnotationId.get(annotation.id);
    if (!savedItem) return [];

    const sourceRects = annotation.sourceRects
      .filter(isValidSourceRect)
      .map((rect) => ({ ...rect }));
    if (sourceRects.length === 0) return [];

    return [{
      annotation: {
        ...annotation,
        sourceRects,
      },
      color: normalizePdfHighlightColor(annotation.color),
      savedItem: {
        ...savedItem,
        tags: [...savedItem.tags],
        ...(savedItem.userTags ? { userTags: [...savedItem.userTags] } : {}),
      },
    }];
  }).sort(comparePdfStoredHighlights);
}

export async function getPdfBacklinkSourceRects(
  target: PdfBacklinkTarget,
  renderedPageIndex: number,
  table: PdfAnnotationTable = db.pdfAnnotations,
): Promise<PdfSourceRectRecord[]> {
  if (
    !Number.isSafeInteger(target.pageIndex)
    || target.pageIndex < 0
    || !Number.isSafeInteger(renderedPageIndex)
    || renderedPageIndex < 0
  ) {
    return [];
  }

  const annotation = await table.get(target.annotationId);
  if (
    !annotation
    || annotation.resourceId !== target.resourceId
    || annotation.pageIndex !== target.pageIndex
  ) {
    return [];
  }

  return annotation.sourceRects
    .filter((rect) => rect.pageIndex === renderedPageIndex && isValidSourceRect(rect))
    .map((rect) => ({ ...rect }));
}

export function isPdfHighlightColor(value: unknown): value is PdfHighlightColor {
  return typeof value === 'string'
    && PDF_HIGHLIGHT_COLORS.includes(value as PdfHighlightColor);
}

export function normalizePdfHighlightColor(
  value: unknown,
): PdfHighlightColor {
  return isPdfHighlightColor(value) ? value : 'yellow';
}

function comparePdfStoredHighlights(
  left: PdfStoredHighlight,
  right: PdfStoredHighlight,
): number {
  if (left.annotation.pageIndex !== right.annotation.pageIndex) {
    return left.annotation.pageIndex - right.annotation.pageIndex;
  }

  const leftY = Math.min(...left.annotation.sourceRects.map((rect) => rect.y));
  const rightY = Math.min(...right.annotation.sourceRects.map((rect) => rect.y));
  if (leftY !== rightY) return leftY - rightY;
  return left.annotation.createdAt - right.annotation.createdAt;
}

function isValidSourceRect(rect: PdfSourceRectRecord): boolean {
  return (
    Number.isSafeInteger(rect.pageIndex)
    && rect.pageIndex >= 0
    && isFiniteNonNegative(rect.x)
    && isFiniteNonNegative(rect.y)
    && Number.isFinite(rect.width)
    && rect.width > 0
    && Number.isFinite(rect.height)
    && rect.height > 0
  );
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
