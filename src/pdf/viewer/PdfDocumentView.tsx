import type { DocumentState } from '@embedpdf/core';
import {
  PdfErrorCode,
  Rotation,
  type PdfEngine,
} from '@embedpdf/models';
import {
  AnnotationLayer,
  useAnnotationCapability,
} from '@embedpdf/plugin-annotation/react';
import {
  DocumentContent,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react';
import { useExport } from '@embedpdf/plugin-export/react';
import {
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import {
  usePan,
  usePanCapability,
} from '@embedpdf/plugin-pan/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import {
  Rotate,
  useRotate,
  useRotateCapability,
} from '@embedpdf/plugin-rotate/react';
import {
  ScrollStrategy,
  Scroller,
  useScroll,
  useScrollCapability,
} from '@embedpdf/plugin-scroll/react';
import type { ScrollMetrics } from '@embedpdf/plugin-scroll';
import { SearchLayer } from '@embedpdf/plugin-search/react';
import {
  SelectionLayer,
  useSelectionCapability,
} from '@embedpdf/plugin-selection/react';
import { TilingLayer } from '@embedpdf/plugin-tiling/react';
import { usePrint } from '@embedpdf/plugin-print/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import {
  useZoom,
  useZoomCapability,
  ZoomGestureWrapper,
  ZoomMode,
} from '@embedpdf/plugin-zoom/react';
import type { ZoomLevel } from '@embedpdf/plugin-zoom';
import {
  AlertCircle,
  ChartNoAxesGantt,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Hand,
  LoaderCircle,
  LockKeyhole,
  PanelLeft,
  Printer,
  RotateCw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';

import type { PdfReaderPanelMode } from './PdfReaderSidebar';
import { shouldIgnorePdfReaderShortcut } from './keyboard';
import {
  PdfHighlightEditor,
  PdfPersistentHighlightLayer,
  PdfSelectionMenu,
} from './PdfHighlights';
import { usePdfHighlights } from './usePdfHighlights';
import { getPdfBacklinkSourceRects } from '../../storage/pdfAnnotations';
import type { PdfSourceRectRecord } from '../../storage/schema';
import {
  PdfReadingAnalytics,
} from '../analytics';
import type { PdfReadingSnapshotLoadState } from '../analytics/types';
import {
  recordPdfDocumentOpen,
  savePdfDocumentViewState,
  toPdfPageCoordinates,
} from '../documentState';
import { openSafePdfExternalLink } from '../externalLinks';
import type { PdfReaderTarget } from '../navigation';
import type { PdfSourceMetadata } from '../source';
import type { PdfReaderZoomLevel } from '../../storage/schema';

interface PdfDocumentViewProps {
  documentId: string;
  engine: PdfEngine;
  onCloseDocument: () => Promise<void>;
  onDocumentStateReady?: () => void;
  onOpenSearch: () => void;
  onReadingSnapshotStateChange?: (
    state: PdfReadingSnapshotLoadState | undefined,
  ) => void;
  initialTarget?: PdfReaderTarget;
  sourceMetadata?: PdfSourceMetadata;
}

export function PdfDocumentView({
  documentId,
  engine,
  initialTarget,
  onCloseDocument,
  onDocumentStateReady,
  onOpenSearch,
  onReadingSnapshotStateChange,
  sourceMetadata,
}: PdfDocumentViewProps) {
  const highlightsState = usePdfHighlights(documentId);
  const [editingHighlightId, setEditingHighlightId] = useState<string>();
  const highlights = highlightsState.status === 'ready'
    ? highlightsState.highlights
    : [];
  const editingHighlight = highlights.find((highlight) =>
    highlight.savedItem.id === editingHighlightId);

  useEffect(() => {
    setEditingHighlightId(undefined);
  }, [documentId]);

  return (
    <DocumentContent documentId={documentId}>
      {({ documentState, isError, isLoaded, isLoading }) => {
        if (isError) {
          return documentState.errorCode === PdfErrorCode.Password
            ? (
              <PasswordPrompt
                documentState={documentState}
                onCloseDocument={onCloseDocument}
              />
            )
            : (
              <ReaderDocumentState
                icon={AlertCircle}
                title="PDF 打开失败"
                description={documentState.error || 'PDFium 无法解析该文件。'}
                action={(
                  <button
                    className="pdf-reader__button pdf-reader__button--secondary"
                    type="button"
                    onClick={() => void onCloseDocument()}
                  >
                    <X aria-hidden="true" />
                    关闭文档
                  </button>
                )}
              />
            );
        }

        if (!isLoading && !isLoaded) return null;

        return (
          <>
            {isLoaded ? (
              <>
                <DocumentKeyboardShortcuts
                  documentId={documentId}
                  onOpenSearch={onOpenSearch}
                />
                <PdfExternalLinkHandler documentId={documentId} />
              </>
            ) : null}
            <GlobalPointerProvider
              documentId={documentId}
              className="pdf-reader__pointer-surface"
            >
              <Viewport
                documentId={documentId}
                className="pdf-reader__viewport"
                aria-label="PDF 连续阅读区"
              >
                {isLoaded ? (
                  <>
                    {documentState.document && sourceMetadata ? (
                      <>
                        <PdfDocumentStateController
                          documentId={documentId}
                          initialTarget={initialTarget}
                          metadata={sourceMetadata}
                          onReady={onDocumentStateReady}
                          pages={documentState.document.pages}
                        />
                        <PdfReadingAnalytics
                          document={documentState.document}
                          documentId={documentId}
                          documentRotation={documentState.rotation}
                          engine={engine}
                          metadata={sourceMetadata}
                          onSnapshotStateChange={onReadingSnapshotStateChange}
                          scale={documentState.scale}
                        />
                      </>
                    ) : null}
                    <ZoomGestureWrapper
                      documentId={documentId}
                      className="pdf-reader__zoom-gesture"
                    >
                      <Scroller
                        documentId={documentId}
                        className="pdf-reader__scroller"
                        renderPage={({ height, pageIndex, pageNumber, width }) => (
                          <div
                            className="pdf-reader__page-shell"
                            data-page-number={pageNumber}
                            aria-label={`第 ${pageNumber} 页`}
                          >
                            <Rotate
                              documentId={documentId}
                              pageIndex={pageIndex}
                              style={{ height, width }}
                            >
                              <PagePointerProvider
                                documentId={documentId}
                                pageIndex={pageIndex}
                                className="pdf-reader__page-layers"
                                style={{ height, width }}
                              >
                                <RenderLayer
                                  documentId={documentId}
                                  pageIndex={pageIndex}
                                  scale={1}
                                  dpr={1}
                                  className="pdf-reader__base-page"
                                  draggable={false}
                                  aria-hidden="true"
                                />
                                <TilingLayer
                                  documentId={documentId}
                                  pageIndex={pageIndex}
                                  className="pdf-reader__tile-layer"
                                  aria-hidden="true"
                                />
                                <SearchLayer
                                  documentId={documentId}
                                  pageIndex={pageIndex}
                                  className="pdf-reader__search-layer"
                                  highlightColor="rgb(243 207 91 / 42%)"
                                  activeHighlightColor="rgb(233 165 58 / 58%)"
                                />
                                <PdfPersistentHighlightLayer
                                  editingSavedItemId={editingHighlightId}
                                  highlights={highlights}
                                  onEdit={setEditingHighlightId}
                                  pageIndex={pageIndex}
                                  scale={documentState.scale}
                                />
                                <PdfBacklinkHighlightLayer
                                  documentId={documentId}
                                  pageIndex={pageIndex}
                                  scale={documentState.scale}
                                  target={initialTarget}
                                />
                                <SelectionLayer
                                  documentId={documentId}
                                  pageIndex={pageIndex}
                                  textStyle={{
                                    background: 'rgb(53 143 97 / 34%)',
                                  }}
                                  selectionMenu={(props) => (
                                    <PdfSelectionMenu
                                      {...props}
                                      documentId={documentId}
                                      sourceMetadata={sourceMetadata}
                                    />
                                  )}
                                />
                                <AnnotationLayer
                                  documentId={documentId}
                                  pageIndex={pageIndex}
                                  className="pdf-reader__annotation-layer"
                                />
                              </PagePointerProvider>
                            </Rotate>
                          </div>
                        )}
                      />
                    </ZoomGestureWrapper>
                  </>
                ) : null}
              </Viewport>
            </GlobalPointerProvider>
            {isLoading ? (
              <ReaderDocumentState
                icon={LoaderCircle}
                title="正在打开 PDF"
                description="PDFium 正在解析页面结构。"
                busy
                overlay
              />
            ) : null}
            {isLoaded ? <FloatingPageControls documentId={documentId} /> : null}
            {isLoaded && editingHighlight ? (
              <PdfHighlightEditor
                key={editingHighlight.savedItem.id}
                highlight={editingHighlight}
                onClose={() => setEditingHighlightId(undefined)}
              />
            ) : null}
          </>
        );
      }}
    </DocumentContent>
  );
}

export function DocumentToolbarControls({
  documentId,
  panelMode,
  onTogglePanel,
}: {
  documentId: string;
  panelMode: PdfReaderPanelMode | null;
  onTogglePanel: (mode: PdfReaderPanelMode) => void;
}) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const { provides: rotate, rotation } = useRotate(documentId);
  const { provides: pan, isPanning } = usePan(documentId);
  const { provides: print } = usePrint(documentId);
  const { provides: exportPdf } = useExport(documentId);
  const [zoomDraft, setZoomDraft] = useState('100');
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'failed'>('idle');

  useEffect(() => {
    setZoomDraft(String(Math.round((zoomState.currentZoomLevel || 1) * 100)));
  }, [zoomState.currentZoomLevel]);

  const submitZoom = () => {
    if (!zoom) return;
    const percentage = Number(zoomDraft);
    if (!Number.isFinite(percentage)) {
      setZoomDraft(String(Math.round((zoomState.currentZoomLevel || 1) * 100)));
      return;
    }

    const normalized = Math.min(600, Math.max(25, percentage));
    setZoomDraft(String(Math.round(normalized)));
    zoom.requestZoom(normalized / 100);
  };

  const zoomMode = typeof zoomState.zoomLevel === 'string'
    ? zoomState.zoomLevel
    : 'custom';
  const navigationPanelOpen =
    panelMode === 'outline' || panelMode === 'thumbnails';
  const navigationPanelMode = panelMode === 'thumbnails'
    ? 'thumbnails'
    : 'outline';
  const printDocument = async () => {
    if (!print || printStatus === 'printing') return;
    setPrintStatus('printing');
    try {
      await print.print().toPromise();
      setPrintStatus('idle');
    } catch {
      setPrintStatus('failed');
    }
  };

  return (
    <div className="pdf-reader__document-tools">
      <button
        className="pdf-reader__icon-button pdf-reader__context-tool"
        type="button"
        aria-label="打开阅读地图"
        aria-controls="pdf-reader-context-panel"
        aria-pressed={panelMode === 'progress'}
        title="阅读地图"
        onClick={() => onTogglePanel('progress')}
      >
        <ChartNoAxesGantt aria-hidden="true" />
      </button>
      <button
        className="pdf-reader__icon-button pdf-reader__context-tool"
        type="button"
        aria-label="切换目录与缩略图面板"
        aria-controls="pdf-reader-context-panel"
        aria-pressed={navigationPanelOpen}
        title="目录与缩略图"
        onClick={() => onTogglePanel(navigationPanelMode)}
      >
        <PanelLeft aria-hidden="true" />
      </button>
      <button
        className="pdf-reader__icon-button pdf-reader__context-tool"
        type="button"
        aria-label="搜索 PDF"
        aria-controls="pdf-reader-context-panel"
        aria-pressed={panelMode === 'search'}
        title="搜索 PDF · ⌘/Ctrl+F"
        onClick={() => onTogglePanel('search')}
      >
        <Search aria-hidden="true" />
      </button>
      <button
        className="pdf-reader__icon-button pdf-reader__context-tool pdf-reader__pan-tool"
        type="button"
        aria-label="切换拖拽浏览"
        aria-pressed={isPanning}
        title="拖拽浏览 · H"
        disabled={!pan}
        onClick={() => pan?.togglePan()}
      >
        <Hand aria-hidden="true" />
      </button>

      <span className="pdf-reader__toolbar-divider" aria-hidden="true" />

      <PageNumberControl
        currentPage={scrollState.currentPage}
        totalPages={scrollState.totalPages}
        onPageChange={(pageNumber) => scroll?.scrollToPage({
          pageNumber,
          behavior: 'smooth',
          alignY: 0,
        })}
      />

      <span
        className="pdf-reader__toolbar-divider pdf-reader__desktop-tool"
        aria-hidden="true"
      />

      <button
        className="pdf-reader__icon-button pdf-reader__desktop-tool"
        type="button"
        aria-label="缩小"
        title="缩小"
        disabled={!zoom}
        onClick={() => zoom?.zoomOut()}
      >
        <ZoomOut aria-hidden="true" />
      </button>
      <label
        className="pdf-reader__zoom-input pdf-reader__desktop-tool"
        title="自定义缩放比例"
      >
        <span className="sr-only">缩放比例</span>
        <input
          inputMode="numeric"
          min={25}
          max={600}
          value={zoomDraft}
          disabled={!zoom}
          onChange={(event) => setZoomDraft(event.target.value)}
          onBlur={submitZoom}
          onKeyDown={(event) => submitInputOnEnter(event, submitZoom)}
        />
        <span aria-hidden="true">%</span>
      </label>
      <button
        className="pdf-reader__icon-button pdf-reader__desktop-tool"
        type="button"
        aria-label="放大"
        title="放大"
        disabled={!zoom}
        onClick={() => zoom?.zoomIn()}
      >
        <ZoomIn aria-hidden="true" />
      </button>
      <label className="pdf-reader__fit-select pdf-reader__desktop-tool">
        <span className="sr-only">页面适配方式</span>
        <select
          value={zoomMode}
          disabled={!zoom}
          onChange={(event) => {
            if (event.target.value === ZoomMode.FitWidth) {
              zoom?.requestZoom(ZoomMode.FitWidth);
            } else if (event.target.value === ZoomMode.FitPage) {
              zoom?.requestZoom(ZoomMode.FitPage);
            }
          }}
        >
          <option value={ZoomMode.FitWidth}>适合宽度</option>
          <option value={ZoomMode.FitPage}>适合页面</option>
          <option value="custom">自定义</option>
        </select>
      </label>

      <span
        className="pdf-reader__toolbar-divider pdf-reader__desktop-tool"
        aria-hidden="true"
      />

      <button
        className="pdf-reader__icon-button pdf-reader__desktop-tool"
        type="button"
        aria-label="顺时针旋转"
        title={`顺时针旋转 · 当前 ${rotation * 90}°`}
        disabled={!rotate}
        onClick={() => rotate?.rotateForward()}
      >
        <RotateCw aria-hidden="true" />
      </button>

      <span
        className="pdf-reader__toolbar-divider pdf-reader__output-tool"
        aria-hidden="true"
      />

      <button
        className="pdf-reader__icon-button pdf-reader__output-tool"
        type="button"
        aria-label="打印 PDF"
        title={printStatus === 'failed' ? '打印失败，请重试' : '打印 PDF'}
        disabled={!print || printStatus === 'printing'}
        aria-busy={printStatus === 'printing'}
        onClick={() => void printDocument()}
      >
        {printStatus === 'printing'
          ? <LoaderCircle className="is-spinning" aria-hidden="true" />
          : <Printer aria-hidden="true" />}
      </button>
      <button
        className="pdf-reader__icon-button pdf-reader__output-tool"
        type="button"
        aria-label="下载 PDF"
        title="下载 PDF"
        disabled={!exportPdf}
        onClick={() => exportPdf?.download()}
      >
        <Download aria-hidden="true" />
      </button>
    </div>
  );
}

function PasswordPrompt({
  documentState,
  onCloseDocument,
}: {
  documentState: DocumentState;
  onCloseDocument: () => Promise<void>;
}) {
  const { provides: documentManager } = useDocumentManagerCapability();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [retryStatus, setRetryStatus] = useState<'idle' | 'retrying' | 'failed'>('idle');

  const isIncorrect = documentState.passwordProvided === true;

  const retry = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!documentManager || password.length === 0 || retryStatus === 'retrying') return;

    setRetryStatus('retrying');
    try {
      const response = await documentManager.retryDocument(
        documentState.id,
        { password },
      ).toPromise();
      await response.task.toPromise();
      setPassword('');
      setRetryStatus('idle');
    } catch {
      setRetryStatus('failed');
    }
  };

  return (
    <div className="pdf-reader__state">
      <form className="pdf-reader__password-card" onSubmit={(event) => void retry(event)}>
        <div className="pdf-reader__state-icon pdf-reader__state-icon--warning" aria-hidden="true">
          <LockKeyhole />
        </div>
        <div>
          <h2>{isIncorrect ? '密码不正确' : '此 PDF 需要密码'}</h2>
          <p>
            {isIncorrect
              ? '请重新输入文档密码。'
              : '密码只用于当前设备上的 PDFium 解锁过程。'}
          </p>
        </div>
        <label className="pdf-reader__password-field">
          <span>文档密码</span>
          <span className="pdf-reader__password-input">
            <input
              autoFocus
              type={showPassword ? 'text' : 'password'}
              value={password}
              disabled={retryStatus === 'retrying'}
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value);
                if (retryStatus === 'failed') setRetryStatus('idle');
              }}
            />
            <button
              type="button"
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              title={showPassword ? '隐藏密码' : '显示密码'}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </span>
        </label>
        {retryStatus === 'failed' ? (
          <p className="pdf-reader__field-error" role="alert">解锁失败，请检查密码后重试。</p>
        ) : null}
        <div className="pdf-reader__state-actions">
          <button
            className="pdf-reader__button pdf-reader__button--secondary"
            type="button"
            disabled={retryStatus === 'retrying'}
            onClick={() => void onCloseDocument()}
          >
            取消
          </button>
          <button
            className="pdf-reader__button pdf-reader__button--primary"
            type="submit"
            disabled={!documentManager || password.length === 0 || retryStatus === 'retrying'}
          >
            {retryStatus === 'retrying' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
            解锁文档
          </button>
        </div>
      </form>
    </div>
  );
}

function FloatingPageControls({ documentId }: { documentId: string }) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<number | undefined>(undefined);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== undefined) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => setVisible(false), 2_200);
  }, [clearHideTimer]);

  const revealTemporarily = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    revealTemporarily();
  }, [revealTemporarily, scrollState.currentPage]);

  useEffect(() => {
    if (!scroll) return;
    return scroll.onScroll(revealTemporarily);
  }, [revealTemporarily, scroll]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return (
    <div
      className="pdf-reader__floating-controls"
      data-visible={visible ? 'true' : 'false'}
      onPointerEnter={() => {
        clearHideTimer();
        setVisible(true);
      }}
      onPointerLeave={scheduleHide}
      onFocusCapture={() => {
        clearHideTimer();
        setVisible(true);
      }}
      onBlurCapture={scheduleHide}
    >
      <button
        type="button"
        aria-label="上一页"
        title="上一页"
        disabled={!scroll || scrollState.currentPage <= 1}
        onClick={() => scroll?.scrollToPreviousPage('smooth')}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <PageNumberControl
        currentPage={scrollState.currentPage}
        totalPages={scrollState.totalPages}
        compact
        onPageChange={(pageNumber) => scroll?.scrollToPage({
          pageNumber,
          behavior: 'smooth',
          alignY: 0,
        })}
      />
      <button
        type="button"
        aria-label="下一页"
        title="下一页"
        disabled={!scroll || scrollState.currentPage >= scrollState.totalPages}
        onClick={() => scroll?.scrollToNextPage('smooth')}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

function PageNumberControl({
  compact = false,
  currentPage,
  totalPages,
  onPageChange,
}: {
  compact?: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (pageNumber: number) => void;
}) {
  const [draft, setDraft] = useState(String(currentPage || 1));

  useEffect(() => {
    setDraft(String(currentPage || 1));
  }, [currentPage]);

  const submit = () => {
    const parsed = Number.parseInt(draft, 10);
    const nextPage = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), Math.max(totalPages, 1))
      : currentPage;
    setDraft(String(nextPage));
    if (nextPage !== currentPage) onPageChange(nextPage);
  };

  return (
    <label
      className={`pdf-reader__page-control ${compact ? 'pdf-reader__page-control--compact' : ''}`}
    >
      <span className="sr-only">页码</span>
      <input
        inputMode="numeric"
        min={1}
        max={Math.max(totalPages, 1)}
        value={draft}
        disabled={totalPages <= 0}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={submit}
        onKeyDown={(event) => submitInputOnEnter(event, submit)}
      />
      <span aria-hidden="true">/</span>
      <output aria-label={`共 ${totalPages} 页`}>{totalPages || '–'}</output>
    </label>
  );
}

function DocumentKeyboardShortcuts({
  documentId,
  onOpenSearch,
}: {
  documentId: string;
  onOpenSearch: () => void;
}) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom } = useZoom(documentId);
  const { provides: rotate } = useRotate(documentId);
  const { provides: pan, isPanning } = usePan(documentId);
  const { provides: selection } = useSelectionCapability();

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (shouldIgnorePdfReaderShortcut(event.target)) return;

      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        onOpenSearch();
        return;
      }

      if (modifier && event.key.toLowerCase() === 'c') {
        const selectionScope = selection?.forDocument(documentId);
        if (selectionScope?.getState().selection) {
          event.preventDefault();
          selectionScope.copyToClipboard();
        }
        return;
      }
      if (modifier && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoom?.zoomIn();
        return;
      }
      if (modifier && event.key === '-') {
        event.preventDefault();
        zoom?.zoomOut();
        return;
      }
      if (modifier && event.key === '0') {
        event.preventDefault();
        zoom?.requestZoom(ZoomMode.FitWidth);
        return;
      }
      if (modifier || event.altKey) return;

      if (event.key === 'PageDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        scroll?.scrollToNextPage('smooth');
      } else if (event.key === 'PageUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        scroll?.scrollToPreviousPage('smooth');
      } else if (event.key === 'Home') {
        event.preventDefault();
        scroll?.scrollToPage({ pageNumber: 1, behavior: 'smooth', alignY: 0 });
      } else if (event.key === 'End') {
        event.preventDefault();
        scroll?.scrollToPage({
          pageNumber: scrollState.totalPages,
          behavior: 'smooth',
          alignY: 100,
        });
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        rotate?.rotateForward();
      } else if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        pan?.togglePan();
      } else if (event.key === '/') {
        event.preventDefault();
        onOpenSearch();
      } else if (event.key === 'Escape' && isPanning) {
        event.preventDefault();
        pan?.disablePan();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    documentId,
    isPanning,
    onOpenSearch,
    pan,
    rotate,
    scroll,
    scrollState.totalPages,
    selection,
    zoom,
  ]);

  return null;
}

function PdfExternalLinkHandler({ documentId }: { documentId: string }) {
  const { provides: annotation } = useAnnotationCapability();

  useEffect(() => {
    if (!annotation) return;

    return annotation.onNavigate((event) => {
      if (
        event.documentId === documentId
        && event.result.outcome === 'uri'
      ) {
        openSafePdfExternalLink(event.result.uri);
      }
    });
  }, [annotation, documentId]);

  return null;
}

function PdfBacklinkHighlightLayer({
  documentId,
  pageIndex,
  scale,
  target,
}: {
  documentId: string;
  pageIndex: number;
  scale: number;
  target?: PdfReaderTarget;
}) {
  const [sourceRects, setSourceRects] = useState<PdfSourceRectRecord[]>([]);
  const annotationId = target?.annotationId;
  const targetPageIndex = target?.pageIndex;
  const targetResourceId = target?.resourceId;

  useEffect(() => {
    let cancelled = false;
    setSourceRects([]);
    if (
      !annotationId
      || targetPageIndex === undefined
      || targetResourceId !== documentId
    ) {
      return;
    }

    void getPdfBacklinkSourceRects({
      annotationId,
      resourceId: targetResourceId,
      pageIndex: targetPageIndex,
    }, pageIndex).then((rects) => {
      if (!cancelled) setSourceRects(rects);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    annotationId,
    documentId,
    pageIndex,
    targetPageIndex,
    targetResourceId,
  ]);

  if (sourceRects.length === 0) return null;

  return (
    <div
      className="pdf-reader__backlink-layer"
      data-pdf-annotation-id={annotationId}
      aria-hidden="true"
    >
      {sourceRects.map((rect, index) => (
        <span
          className="pdf-reader__backlink-highlight"
          key={`${rect.pageIndex}:${rect.x}:${rect.y}:${index}`}
          style={{
            left: rect.x * scale,
            top: rect.y * scale,
            width: rect.width * scale,
            height: rect.height * scale,
          }}
        />
      ))}
    </div>
  );
}

function PdfDocumentStateController({
  documentId,
  initialTarget,
  metadata,
  onReady,
  pages,
}: {
  documentId: string;
  initialTarget?: PdfReaderTarget;
  metadata: PdfSourceMetadata;
  onReady?: () => void;
  pages: NonNullable<DocumentState['document']>['pages'];
}) {
  const { provides: scrollCapability } = useScrollCapability();
  const { provides: zoomCapability } = useZoomCapability();
  const { provides: rotateCapability } = useRotateCapability();
  const { provides: panCapability } = usePanCapability();
  const restoredDocumentRef = useRef<string | undefined>(undefined);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  useEffect(() => {
    if (
      !scrollCapability
      || !zoomCapability
      || !rotateCapability
      || !panCapability
    ) {
      return;
    }
    if (restoredDocumentRef.current === documentId) return;

    const scroll = scrollCapability.forDocument(documentId);
    const zoom = zoomCapability.forDocument(documentId);
    const rotate = rotateCapability.forDocument(documentId);
    const pan = panCapability.forDocument(documentId);
    let cancelled = false;
    let saveTimer: number | undefined;
    let persistNow = () => undefined;
    const unsubscribers: Array<() => void> = [];

    void (async () => {
      const stored = await recordPdfDocumentOpen(metadata);
      if (cancelled) return;

      const scrollStrategy = stored.scrollStrategy === 'horizontal'
        ? ScrollStrategy.Horizontal
        : ScrollStrategy.Vertical;
      const target = initialTarget?.resourceId === documentId
        ? initialTarget
        : undefined;
      const requestedPageIndex = target?.pageIndex ?? stored.pageIndex;
      const pageIndex = Math.min(
        Math.max(0, requestedPageIndex),
        Math.max(0, scroll.getTotalPages() - 1),
      );
      const requestedPageCoordinates = target?.pageCoordinates ?? stored.pageCoordinates;
      const pageCoordinates = pageIndex === requestedPageIndex
        ? requestedPageCoordinates
        : undefined;

      scroll.setScrollStrategy(scrollStrategy);
      rotate.setRotation(stored.rotation as Rotation);
      if (stored.isPanMode) {
        pan.enablePan();
      } else {
        pan.disablePan();
      }
      zoom.requestZoom(toEmbedPdfZoomLevel(stored.zoomLevel));

      await waitForAnimationFrame();
      await waitForAnimationFrame();
      if (cancelled) return;

      scroll.scrollToPage({
        pageNumber: pageIndex + 1,
        ...(pageCoordinates ? { pageCoordinates } : {}),
        behavior: 'instant',
        alignY: 0,
      });
      restoredDocumentRef.current = documentId;
      onReady?.();

      persistNow = () => {
        if (cancelled || restoredDocumentRef.current !== documentId) return;

        let metrics: ScrollMetrics;
        try {
          // Rotation refreshes the scroll layout without emitting a scroll event,
          // so the flush must sample current metrics instead of reusing an old event.
          metrics = scroll.getMetrics();
        } catch {
          return;
        }
        const currentPage = Math.max(1, metrics.currentPage);
        const currentPageMetrics = metrics.pageVisibilityMetrics.find(
          (page) => page.pageNumber === currentPage,
        );
        const currentPageObject = pagesRef.current[currentPage - 1];
        const rotation = rotate.getRotation();
        const pageCoordinates = currentPageMetrics && currentPageObject
          ? toPdfPageCoordinates(
              {
                x: currentPageMetrics.original.pageX,
                y: currentPageMetrics.original.pageY,
              },
              currentPageObject.size,
              ((currentPageObject.rotation ?? 0) + rotation) % 4,
            )
          : undefined;
        void savePdfDocumentViewState(documentId, {
          pageIndex: currentPage - 1,
          ...(pageCoordinates ? { pageCoordinates } : {}),
          zoomLevel: zoom.getState().zoomLevel,
          scrollStrategy,
          rotation,
          isPanMode: pan.isPanMode(),
        }).catch(() => undefined);
      };
      const scheduleSave = () => {
        if (saveTimer !== undefined) {
          window.clearTimeout(saveTimer);
        }
        saveTimer = window.setTimeout(persistNow, 320);
      };

      unsubscribers.push(
        scroll.onScroll(scheduleSave),
        zoom.onStateChange(scheduleSave),
        rotate.onRotateChange(scheduleSave),
        pan.onPanModeChange(scheduleSave),
      );
      window.addEventListener('pagehide', persistNow);
      unsubscribers.push(() => window.removeEventListener('pagehide', persistNow));
    })().catch(() => {
      onReady?.();
    });

    return () => {
      persistNow();
      cancelled = true;
      if (saveTimer !== undefined) {
        window.clearTimeout(saveTimer);
      }
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    documentId,
    initialTarget,
    metadata,
    onReady,
    panCapability,
    rotateCapability,
    scrollCapability,
    zoomCapability,
  ]);

  return null;
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function toEmbedPdfZoomLevel(value: PdfReaderZoomLevel): ZoomLevel {
  if (value === 'automatic') return ZoomMode.Automatic;
  if (value === 'fit-page') return ZoomMode.FitPage;
  if (value === 'fit-width') return ZoomMode.FitWidth;
  return value;
}

function ReaderDocumentState({
  action,
  busy = false,
  description,
  icon: Icon,
  overlay = false,
  title,
}: {
  action?: ReactNode;
  busy?: boolean;
  description: string;
  icon: typeof AlertCircle;
  overlay?: boolean;
  title: string;
}) {
  return (
    <div
      className={`pdf-reader__state${overlay ? ' pdf-reader__state--overlay' : ''}`}
      role={busy ? 'status' : 'alert'}
      aria-live="polite"
    >
      <div className="pdf-reader__state-content">
        <div className="pdf-reader__state-icon" aria-hidden="true">
          <Icon className={busy ? 'is-spinning' : ''} />
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        {action ? <div className="pdf-reader__state-actions">{action}</div> : null}
      </div>
    </div>
  );
}

function submitInputOnEnter(
  event: ReactKeyboardEvent<HTMLInputElement>,
  submit: () => void,
) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  submit();
  event.currentTarget.blur();
}
