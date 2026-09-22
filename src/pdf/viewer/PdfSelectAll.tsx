import {
  PdfErrorCode,
  stripPdfUnwantedMarkers,
  type PdfDocumentObject,
  type PdfEngine,
  type PdfPageTextRuns,
  type PdfTask,
  type Rect,
  type Size,
} from '@embedpdf/models';
import { mergeAdjacentRects } from '@embedpdf/plugin-selection';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

interface PdfSelectAllControls {
  active: boolean;
  clear: () => void;
  copy: () => void;
  getText: () => Promise<string>;
  selectAll: () => void;
}

interface PdfSelectAllLayerState {
  active: boolean;
  pageRects: ReadonlyMap<number, readonly Rect[]>;
  requestPageRects: (pageIndex: number) => void;
}

const PdfSelectAllControlsContext = createContext<PdfSelectAllControls | null>(
  null,
);
const PdfSelectAllLayerContext = createContext<PdfSelectAllLayerState | null>(
  null,
);

const PDF_SELECT_ALL_ABORT_REASON = {
  code: PdfErrorCode.Unknown,
  message: 'PDF select-all task was cancelled.',
};

export function PdfSelectAllProvider({
  children,
  document: pdfDocument,
  documentId,
  engine,
}: {
  children: ReactNode;
  document?: PdfDocumentObject | null;
  documentId: string;
  engine: PdfEngine;
}) {
  const { provides: selection } = useSelectionCapability();
  const [active, setActive] = useState(false);
  const [pageRects, setPageRects] = useState<
    ReadonlyMap<number, readonly Rect[]>
  >(new Map());
  const pageRectsRef = useRef(new Map<number, readonly Rect[]>());
  const pageTasksRef = useRef(new Map<number, PdfTask<PdfPageTextRuns>>());
  const documentTextRef = useRef<string | undefined>(undefined);
  const documentTextPromiseRef = useRef<Promise<string> | undefined>(undefined);
  const documentTextTaskRef = useRef<PdfTask<string> | undefined>(undefined);
  const disposedRef = useRef(false);

  const getDocumentText = useCallback((): Promise<string> => {
    if (!pdfDocument) return Promise.resolve('');
    if (documentTextRef.current !== undefined) {
      return Promise.resolve(documentTextRef.current);
    }
    if (documentTextPromiseRef.current) {
      return documentTextPromiseRef.current;
    }

    const task = engine.extractText(
      pdfDocument,
      pdfDocument.pages.map((page) => page.index),
    );
    documentTextTaskRef.current = task;
    const promise = task.toPromise()
      .then((text) => {
        if (!disposedRef.current) {
          documentTextRef.current = text;
        }
        return text;
      })
      .finally(() => {
        if (documentTextTaskRef.current === task) {
          documentTextTaskRef.current = undefined;
        }
        if (documentTextPromiseRef.current === promise) {
          documentTextPromiseRef.current = undefined;
        }
      });
    documentTextPromiseRef.current = promise;
    return promise;
  }, [engine, pdfDocument]);

  const clear = useCallback(() => {
    setActive(false);
  }, []);

  const selectAll = useCallback(() => {
    if (!pdfDocument) return;

    const selectionScope = selection?.forDocument(documentId);
    if (selectionScope?.getState().selection) {
      selectionScope.clear();
    }
    window.getSelection()?.removeAllRanges();
    setActive(true);
    void getDocumentText().catch(() => undefined);
  }, [documentId, getDocumentText, pdfDocument, selection]);

  const copy = useCallback(() => {
    if (!active) return;

    void getDocumentText()
      .then((text) => {
        if (text && navigator.clipboard?.writeText) {
          return navigator.clipboard.writeText(text);
        }
        return undefined;
      })
      .catch(() => undefined);
  }, [active, getDocumentText]);

  const requestPageRects = useCallback((pageIndex: number) => {
    if (
      !pdfDocument
      || pageRectsRef.current.has(pageIndex)
      || pageTasksRef.current.has(pageIndex)
    ) {
      return;
    }

    const page = pdfDocument.pages[pageIndex];
    if (!page) return;

    const task = engine.getPageTextRuns(pdfDocument, page);
    pageTasksRef.current.set(pageIndex, task);
    void task.toPromise()
      .then((textRuns) => {
        if (disposedRef.current) return;
        const nextPageRects = new Map(pageRectsRef.current);
        nextPageRects.set(
          pageIndex,
          createPdfSelectAllRects(textRuns, page.size),
        );
        pageRectsRef.current = nextPageRects;
        setPageRects(nextPageRects);
      })
      .catch(() => undefined)
      .finally(() => {
        if (pageTasksRef.current.get(pageIndex) === task) {
          pageTasksRef.current.delete(pageIndex);
        }
      });
  }, [engine, pdfDocument]);

  useEffect(() => {
    if (!active) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button === 0 && !event.ctrlKey) {
        setActive(false);
      }
    };
    globalThis.document.addEventListener(
      'pointerdown',
      handlePointerDown,
      true,
    );
    return () => {
      globalThis.document.removeEventListener(
        'pointerdown',
        handlePointerDown,
        true,
      );
    };
  }, [active]);

  useEffect(() => () => {
    disposedRef.current = true;
    documentTextTaskRef.current?.abort(PDF_SELECT_ALL_ABORT_REASON);
    for (const task of pageTasksRef.current.values()) {
      task.abort(PDF_SELECT_ALL_ABORT_REASON);
    }
    pageTasksRef.current.clear();
  }, []);

  const controls = useMemo<PdfSelectAllControls>(() => ({
    active,
    clear,
    copy,
    getText: getDocumentText,
    selectAll,
  }), [active, clear, copy, getDocumentText, selectAll]);
  const layerState = useMemo<PdfSelectAllLayerState>(() => ({
    active,
    pageRects,
    requestPageRects,
  }), [active, pageRects, requestPageRects]);

  return (
    <PdfSelectAllControlsContext.Provider value={controls}>
      <PdfSelectAllLayerContext.Provider value={layerState}>
        {children}
      </PdfSelectAllLayerContext.Provider>
    </PdfSelectAllControlsContext.Provider>
  );
}

export function usePdfSelectAllControls(): PdfSelectAllControls {
  const context = useContext(PdfSelectAllControlsContext);
  if (!context) {
    throw new Error('PDF select-all controls require PdfSelectAllProvider.');
  }
  return context;
}

export function PdfSelectAllLayer({
  pageIndex,
  scale,
}: {
  pageIndex: number;
  scale: number;
}) {
  const context = useContext(PdfSelectAllLayerContext);
  const active = context?.active ?? false;
  const requestPageRects = context?.requestPageRects;

  useEffect(() => {
    if (active) {
      requestPageRects?.(pageIndex);
    }
  }, [active, pageIndex, requestPageRects]);

  if (!active || !context) return null;
  const rects = context.pageRects.get(pageIndex) ?? [];

  return (
    <div
      className="pdf-reader__select-all-layer"
      data-page-index={pageIndex}
      aria-hidden="true"
    >
      {rects.map((rect, index) => (
        <span
          key={index}
          className="pdf-reader__select-all-mark"
          style={{
            left: rect.origin.x * scale,
            top: rect.origin.y * scale,
            width: rect.size.width * scale,
            height: rect.size.height * scale,
          }}
        />
      ))}
    </div>
  );
}

export function createPdfSelectAllRects(
  textRuns: PdfPageTextRuns,
  pageSize: Size,
): Rect[] {
  const selectableRuns = textRuns.runs.flatMap((run) => {
    if (!stripPdfUnwantedMarkers(run.text).trim()) return [];
    const rect = sanitizeTextRect(run.rect, pageSize);
    return rect ? [{
      rect,
      charCount: Math.max(1, run.charCount),
      fontSize: run.fontSize,
    }] : [];
  });

  return mergeAdjacentRects(selectableRuns);
}

function sanitizeTextRect(rect: Rect, pageSize: Size): Rect | undefined {
  const values = [
    rect.origin.x,
    rect.origin.y,
    rect.size.width,
    rect.size.height,
    pageSize.width,
    pageSize.height,
  ];
  if (
    values.some((value) => !Number.isFinite(value))
    || rect.size.width <= 0
    || rect.size.height <= 0
    || pageSize.width <= 0
    || pageSize.height <= 0
  ) {
    return undefined;
  }

  const left = Math.max(0, Math.min(pageSize.width, rect.origin.x));
  const top = Math.max(0, Math.min(pageSize.height, rect.origin.y));
  const right = Math.max(
    left,
    Math.min(pageSize.width, rect.origin.x + rect.size.width),
  );
  const bottom = Math.max(
    top,
    Math.min(pageSize.height, rect.origin.y + rect.size.height),
  );
  if (right <= left || bottom <= top) return undefined;

  return {
    origin: { x: left, y: top },
    size: { width: right - left, height: bottom - top },
  };
}
