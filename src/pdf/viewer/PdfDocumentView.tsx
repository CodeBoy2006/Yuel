import type { DocumentState } from '@embedpdf/core';
import { PdfErrorCode } from '@embedpdf/models';
import {
  DocumentContent,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { Rotate, useRotate } from '@embedpdf/plugin-rotate/react';
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/react';
import { TilingLayer } from '@embedpdf/plugin-tiling/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  RotateCw,
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

interface PdfDocumentViewProps {
  documentId: string;
  onCloseDocument: () => Promise<void>;
}

export function PdfDocumentView({
  documentId,
  onCloseDocument,
}: PdfDocumentViewProps) {
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
            {isLoaded ? <DocumentKeyboardShortcuts documentId={documentId} /> : null}
            <Viewport
              documentId={documentId}
              className="pdf-reader__viewport"
              aria-label="PDF 连续阅读区"
            >
              {isLoaded ? (
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
                        <div
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
                        </div>
                      </Rotate>
                    </div>
                  )}
                />
              ) : null}
            </Viewport>
            {isLoading ? (
              <ReaderDocumentState
                icon={LoaderCircle}
                title="正在打开 PDF"
                description="PDFium 正在解析页面结构。"
                busy
                overlay
              />
            ) : null}
            {isLoaded ? <FloatingDocumentControls documentId={documentId} /> : null}
          </>
        );
      }}
    </DocumentContent>
  );
}

export function DocumentToolbarControls({ documentId }: { documentId: string }) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const { provides: rotate, rotation } = useRotate(documentId);
  const [zoomDraft, setZoomDraft] = useState('100');

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

  return (
    <div className="pdf-reader__document-tools">
      <PageNumberControl
        currentPage={scrollState.currentPage}
        totalPages={scrollState.totalPages}
        onPageChange={(pageNumber) => scroll?.scrollToPage({
          pageNumber,
          behavior: 'smooth',
          alignY: 0,
        })}
      />

      <span className="pdf-reader__toolbar-divider" aria-hidden="true" />

      <button
        className="pdf-reader__icon-button"
        type="button"
        aria-label="缩小"
        title="缩小"
        disabled={!zoom}
        onClick={() => zoom?.zoomOut()}
      >
        <ZoomOut aria-hidden="true" />
      </button>
      <label className="pdf-reader__zoom-input" title="自定义缩放比例">
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
        className="pdf-reader__icon-button"
        type="button"
        aria-label="放大"
        title="放大"
        disabled={!zoom}
        onClick={() => zoom?.zoomIn()}
      >
        <ZoomIn aria-hidden="true" />
      </button>
      <label className="pdf-reader__fit-select">
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

      <span className="pdf-reader__toolbar-divider" aria-hidden="true" />

      <button
        className="pdf-reader__icon-button"
        type="button"
        aria-label="顺时针旋转"
        title={`顺时针旋转 · 当前 ${rotation * 90}°`}
        disabled={!rotate}
        onClick={() => rotate?.rotateForward()}
      >
        <RotateCw aria-hidden="true" />
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

function FloatingDocumentControls({ documentId }: { documentId: string }) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom, state: zoomState } = useZoom(documentId);
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
  }, [revealTemporarily, scrollState.currentPage, zoomState.currentZoomLevel]);

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
      <span className="pdf-reader__floating-divider" aria-hidden="true" />
      <button
        type="button"
        aria-label="缩小"
        title="缩小"
        disabled={!zoom}
        onClick={() => zoom?.zoomOut()}
      >
        <ZoomOut aria-hidden="true" />
      </button>
      <output aria-label="当前缩放比例">
        {Math.round((zoomState.currentZoomLevel || 1) * 100)}%
      </output>
      <button
        type="button"
        aria-label="放大"
        title="放大"
        disabled={!zoom}
        onClick={() => zoom?.zoomIn()}
      >
        <ZoomIn aria-hidden="true" />
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

function DocumentKeyboardShortcuts({ documentId }: { documentId: string }) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom } = useZoom(documentId);
  const { provides: rotate } = useRotate(documentId);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const modifier = event.metaKey || event.ctrlKey;
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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rotate, scroll, scrollState.totalPages, zoom]);

  return null;
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

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}
