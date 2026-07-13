import type {
  PdfDocumentObject,
  Rotation,
} from '@embedpdf/models';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useViewportElement } from '@embedpdf/plugin-viewport/react';
import {
  useEffect,
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
import type { PdfReadingRuntimeModel } from './runtime';

export interface PdfReadingAnalyticsProps {
  document: PdfDocumentObject;
  documentId: string;
  documentRotation: Rotation;
  engine: PdfTextRunsEngine;
  metadata: PdfSourceMetadata;
  scale: number;
}

export function PdfReadingAnalytics({
  document,
  documentId,
  documentRotation,
  engine,
  metadata,
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

    void extractPdfReadingSnapshot(
      engine,
      activeDocument,
      activeMetadata,
      { signal: controller.signal },
    ).then((snapshot) => {
      if (!controller.signal.aborted && snapshot.chunks.length > 0) {
        setModel(createPdfReadingRuntimeModel(snapshot, activeDocument));
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        console.warn('Failed to extract PDF text for local reading analytics', error);
      }
    });

    return () => controller.abort();
  }, [documentId, engine, metadata.resourceId]);

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

  useEffect(() => {
    bridgeRef.current?.refreshLayout();
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
