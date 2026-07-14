import {
  db,
  type PdfAnnotationRecord,
  type PdfSourceRectRecord,
} from './schema';

export interface PdfBacklinkTarget {
  annotationId: string;
  resourceId: string;
  pageIndex: number;
}

interface PdfAnnotationTable {
  get(id: string): Promise<PdfAnnotationRecord | undefined>;
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
