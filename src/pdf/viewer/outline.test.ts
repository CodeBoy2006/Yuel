import {
  PdfActionType,
  PdfZoomMode,
  type PdfBookmarkObject,
  type PdfDestinationObject,
} from '@embedpdf/models';
import { ZoomMode } from '@embedpdf/plugin-zoom';
import { describe, expect, it } from 'vitest';

import { getPdfOutlineDestination } from './outline';

function destination(
  pageIndex: number,
  zoom: PdfDestinationObject['zoom'] = { mode: PdfZoomMode.Unknown },
): PdfDestinationObject {
  return {
    pageIndex,
    zoom,
    view: [],
  };
}

describe('PDF outline destinations', () => {
  it('reads direct and local GoTo bookmark targets', () => {
    const direct: PdfBookmarkObject = {
      title: 'Direct',
      target: {
        type: 'destination',
        destination: destination(2),
      },
    };
    const action: PdfBookmarkObject = {
      title: 'Action',
      target: {
        type: 'action',
        action: {
          type: PdfActionType.Goto,
          destination: destination(4),
        },
      },
    };

    expect(getPdfOutlineDestination(direct)).toEqual({ pageIndex: 2 });
    expect(getPdfOutlineDestination(action)).toEqual({ pageIndex: 4 });
  });

  it('maps PDF fit modes to the existing reader zoom modes', () => {
    const fitWidth: PdfBookmarkObject = {
      title: 'Fit width',
      target: {
        type: 'destination',
        destination: destination(1, {
          mode: PdfZoomMode.FitHorizontal,
        }),
      },
    };
    const fitPage: PdfBookmarkObject = {
      title: 'Fit page',
      target: {
        type: 'destination',
        destination: destination(3, {
          mode: PdfZoomMode.FitBoundingBoxVertical,
        }),
      },
    };

    expect(getPdfOutlineDestination(fitWidth)).toEqual({
      pageIndex: 1,
      zoom: ZoomMode.FitWidth,
    });
    expect(getPdfOutlineDestination(fitPage)).toEqual({
      pageIndex: 3,
      zoom: ZoomMode.FitPage,
    });
  });

  it('uses an explicit XYZ zoom without forwarding incompatible PDF coordinates', () => {
    const bookmark: PdfBookmarkObject = {
      title: 'Detailed section',
      target: {
        type: 'destination',
        destination: destination(5, {
          mode: PdfZoomMode.XYZ,
          params: {
            x: 72,
            y: 640,
            zoom: 1.5,
          },
        }),
      },
    };

    expect(getPdfOutlineDestination(bookmark)).toEqual({
      pageIndex: 5,
      zoom: 1.5,
    });
  });

  it('leaves external, URI, missing, and invalid destinations inactive', () => {
    const bookmarks: PdfBookmarkObject[] = [
      { title: 'No target' },
      {
        title: 'Remote',
        target: {
          type: 'action',
          action: {
            type: PdfActionType.RemoteGoto,
            destination: destination(1),
          },
        },
      },
      {
        title: 'Website',
        target: {
          type: 'action',
          action: {
            type: PdfActionType.URI,
            uri: 'https://example.com',
          },
        },
      },
      {
        title: 'Invalid page',
        target: {
          type: 'destination',
          destination: destination(-1),
        },
      },
    ];

    expect(bookmarks.map(getPdfOutlineDestination)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
