import type {
  PdfDocumentObject,
  Rotation,
} from '@embedpdf/models';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useViewportElement } from '@embedpdf/plugin-viewport/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { PdfSourceMetadata } from '../source';
import {
  extractPdfReadingSnapshot,
  type PdfTextRunsEngine,
} from './extract';
import { createPdfReadingRuntimeModel } from './runtime';
import {
  startPdfReadingSessionBridge,
  type PdfReadingSessionBridge,
} from './session';
import type {
  PdfReadingRuntimeModel,
} from './runtime';
import type { PdfReadingSnapshotLoadState } from './types';

export interface PdfReadingAnalyticsProps {
  document: PdfDocumentObject;
  documentId: string;
  documentRotation: Rotation;
  engine: PdfTextRunsEngine;
  metadata: PdfSourceMetadata;
  onSnapshotStateChange?: (state: PdfReadingSnapshotLoadState | undefined) => void;
  scale: number;
}

export function PdfReadingAnalytics({
  document,
  documentId,
  documentRotation,
  engine,
  metadata,
  onSnapshotStateChange,
  scale,
}: PdfReadingAnalyticsProps) {
  const viewportElementRef = useViewportElement();
  const { provides: selection } = useSelectionCapability();
  const [model, setModel] = useState<PdfReadingRuntimeModel>();
  const bridgeRef = useRef<PdfReadingSessionBridge | undefined>(undefined);
  const documentRef = useRef(document);
  const metadataRef = useRef(metadata);
  const scaleRef = useRef(scale);
  const rotationRef = useRef(documentRotation);

  documentRef.current = document;
  metadataRef.current = metadata;
  scaleRef.current = scale;
  rotationRef.current = documentRotation;

  useEffect(() => {
    const controller = new AbortController();
    const activeDocument = documentRef.current;
    const activeMetadata = metadataRef.current;
    setModel(undefined);
    onSnapshotStateChange?.({ status: 'loading' });

    void extractPdfReadingSnapshot(
      engine,
      activeDocument,
      activeMetadata,
      { signal: controller.signal },
    ).then((snapshot) => {
      if (!controller.signal.aborted) {
        if (snapshot.chunks.length > 0) {
          setModel(createPdfReadingRuntimeModel(snapshot, activeDocument));
        }
        onSnapshotStateChange?.({ status: 'ready', snapshot });
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        console.warn('Failed to extract PDF text for local reading analytics', error);
        onSnapshotStateChange?.({ status: 'error' });
      }
    });

    return () => {
      controller.abort();
      onSnapshotStateChange?.(undefined);
    };
  }, [documentId, engine, metadata.resourceId, onSnapshotStateChange]);

  useEffect(() => {
    const viewportElement = viewportElementRef?.current;
    if (!model || !viewportElement) {
      return;
    }

    const bridge = startPdfReadingSessionBridge({
      model,
      viewportElement,
      getDocumentRotation: () => rotationRef.current,
      getScale: () => scaleRef.current,
    });
    bridgeRef.current = bridge;

    return () => {
      if (bridgeRef.current === bridge) {
        bridgeRef.current = undefined;
      }
      bridge.stop();
    };
  }, [model, viewportElementRef]);

  useLayoutEffect(() => {
    bridgeRef.current?.resetScrollCoordinates();
  }, [documentRotation, scale]);

  useEffect(() => {
    if (!selection) {
      return;
    }

    const selectionScope = selection.forDocument(documentId);
    return selectionScope.onEndSelection(() => {
      void selectionScope.getSelectedText().toPromise()
        .then((selectedText) => {
          bridgeRef.current?.recordSelection(selectedText.join(' '));
        })
        .catch(() => undefined);
    });
  }, [documentId, selection]);

  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
