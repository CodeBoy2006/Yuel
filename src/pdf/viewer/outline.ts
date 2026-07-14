import {
  PdfActionType,
  PdfZoomMode,
  type PdfBookmarkObject,
  type PdfDestinationObject,
} from '@embedpdf/models';
import {
  ZoomMode,
  type ZoomLevel,
} from '@embedpdf/plugin-zoom';

export interface PdfOutlineDestination {
  pageIndex: number;
  zoom?: ZoomLevel;
}

export function getPdfOutlineDestination(
  bookmark: PdfBookmarkObject,
): PdfOutlineDestination | undefined {
  const destination = getLocalDestination(bookmark);
  if (
    !destination
    || !Number.isSafeInteger(destination.pageIndex)
    || destination.pageIndex < 0
  ) {
    return undefined;
  }

  const zoom = getOutlineZoom(destination);
  return {
    pageIndex: destination.pageIndex,
    ...(zoom === undefined ? {} : { zoom }),
  };
}

function getLocalDestination(
  bookmark: PdfBookmarkObject,
): PdfDestinationObject | undefined {
  const target = bookmark.target;
  if (!target) return undefined;
  if (target.type === 'destination') return target.destination;

  return target.action.type === PdfActionType.Goto
    ? target.action.destination
    : undefined;
}

function getOutlineZoom(
  destination: PdfDestinationObject,
): ZoomLevel | undefined {
  switch (destination.zoom.mode) {
    case PdfZoomMode.XYZ:
      return destination.zoom.params.zoom > 0
        ? destination.zoom.params.zoom
        : undefined;
    case PdfZoomMode.FitHorizontal:
    case PdfZoomMode.FitBoundingBoxHorizontal:
      return ZoomMode.FitWidth;
    case PdfZoomMode.FitPage:
    case PdfZoomMode.FitVertical:
    case PdfZoomMode.FitBoundingBox:
    case PdfZoomMode.FitBoundingBoxVertical:
      return ZoomMode.FitPage;
    default:
      return undefined;
  }
}
