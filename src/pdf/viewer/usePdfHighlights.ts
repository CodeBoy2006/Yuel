import { liveQuery } from 'dexie';
import {
  useEffect,
  useState,
} from 'react';

import {
  getPdfHighlightsForResource,
  type PdfStoredHighlight,
} from '../../storage/pdfAnnotations';

export type PdfHighlightsState =
  | { status: 'loading' }
  | { status: 'ready'; highlights: PdfStoredHighlight[] }
  | { status: 'error' };

export function usePdfHighlights(resourceId: string): PdfHighlightsState {
  const [state, setState] = useState<PdfHighlightsState>({
    status: 'loading',
  });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    const subscription = liveQuery(
      () => getPdfHighlightsForResource(resourceId),
    ).subscribe({
      next: (highlights) => {
        if (active) setState({ status: 'ready', highlights });
      },
      error: () => {
        if (active) setState({ status: 'error' });
      },
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [resourceId]);

  return state;
}
