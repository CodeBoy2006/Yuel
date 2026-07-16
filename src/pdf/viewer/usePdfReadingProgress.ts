import { liveQuery } from 'dexie';
import {
  useEffect,
  useState,
} from 'react';

import {
  createPdfDocumentReadingProgress,
  type PdfDocumentReadingProgress,
} from '../analytics/progress';
import type { PdfReadingSnapshotLoadState } from '../analytics/types';
import { db } from '../../storage/schema';

export type PdfReadingProgressState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; progress: PdfDocumentReadingProgress }
  | { status: 'error' };

export function usePdfReadingProgress(
  snapshotState: PdfReadingSnapshotLoadState | undefined,
): PdfReadingProgressState {
  const [state, setState] = useState<PdfReadingProgressState>({ status: 'idle' });

  useEffect(() => {
    if (!snapshotState) {
      setState({ status: 'idle' });
      return;
    }
    if (snapshotState.status === 'loading') {
      setState({ status: 'loading' });
      return;
    }
    if (snapshotState.status === 'error') {
      setState({ status: 'error' });
      return;
    }

    let active = true;
    setState({ status: 'loading' });
    const { snapshot } = snapshotState;
    const subscription = liveQuery(
      () => db.textChunks.where('pageId').equals(snapshot.page.pageId).toArray(),
    ).subscribe({
      next: (records) => {
        if (!active) return;
        setState({
          status: 'ready',
          progress: createPdfDocumentReadingProgress(snapshot, records),
        });
      },
      error: () => {
        if (active) setState({ status: 'error' });
      },
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [snapshotState]);

  return state;
}
