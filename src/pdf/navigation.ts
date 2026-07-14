const PDF_RESOURCE_ID_PATTERN = /^pdf_[a-f0-9]{64}$/;
const PDF_ANNOTATION_ID_PATTERN = /^pdf_annotation_[a-z0-9_-]{1,160}$/;

export interface PdfReaderTarget {
  resourceId: string;
  pageIndex: number;
  annotationId?: string;
  pageCoordinates?: {
    x: number;
    y: number;
  };
}

export function createPdfReaderUrl(
  baseUrl: string,
  target: PdfReaderTarget,
): string {
  assertPdfReaderTarget(target);
  const url = new URL('/pdf-reader.html', baseUrl);
  url.searchParams.set('resource', target.resourceId);
  url.searchParams.set('page', String(target.pageIndex + 1));

  if (target.annotationId) {
    url.searchParams.set('annotation', target.annotationId);
  }
  if (target.pageCoordinates) {
    url.searchParams.set('x', formatCoordinate(target.pageCoordinates.x));
    url.searchParams.set('y', formatCoordinate(target.pageCoordinates.y));
  }

  return url.toString();
}

export function parsePdfReaderTarget(search: string): PdfReaderTarget | undefined {
  const params = new URLSearchParams(search);
  const resourceId = params.get('resource')?.trim() ?? '';
  const pageValue = params.get('page')?.trim() ?? '';
  const pageNumber = Number(pageValue);
  if (
    !PDF_RESOURCE_ID_PATTERN.test(resourceId)
    || pageValue === ''
    || !Number.isSafeInteger(pageNumber)
    || pageNumber < 1
  ) {
    return undefined;
  }

  const x = parseCoordinate(params.get('x'));
  const y = parseCoordinate(params.get('y'));
  const annotationId = parseAnnotationId(params.get('annotation'));
  const pageCoordinates = x === undefined || y === undefined
    ? undefined
    : { x, y };

  return {
    resourceId,
    pageIndex: pageNumber - 1,
    ...(annotationId ? { annotationId } : {}),
    ...(pageCoordinates ? { pageCoordinates } : {}),
  };
}

function assertPdfReaderTarget(target: PdfReaderTarget): void {
  if (!PDF_RESOURCE_ID_PATTERN.test(target.resourceId)) {
    throw new RangeError('PDF reader targets require a stable PDF resource ID.');
  }
  if (!Number.isSafeInteger(target.pageIndex) || target.pageIndex < 0) {
    throw new RangeError('PDF reader targets require a non-negative page index.');
  }
  if (
    target.annotationId
    && !PDF_ANNOTATION_ID_PATTERN.test(target.annotationId)
  ) {
    throw new RangeError('PDF reader targets require a valid PDF annotation ID.');
  }
  if (
    target.pageCoordinates
    && (
      !isValidCoordinate(target.pageCoordinates.x)
      || !isValidCoordinate(target.pageCoordinates.y)
    )
  ) {
    throw new RangeError('PDF reader target coordinates must be finite and non-negative.');
  }
}

function parseAnnotationId(value: string | null): string | undefined {
  const annotationId = value?.trim() ?? '';
  return PDF_ANNOTATION_ID_PATTERN.test(annotationId)
    ? annotationId
    : undefined;
}

function parseCoordinate(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return isValidCoordinate(parsed) ? parsed : undefined;
}

function isValidCoordinate(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function formatCoordinate(value: number): string {
  return String(Math.round(value * 1_000) / 1_000);
}
