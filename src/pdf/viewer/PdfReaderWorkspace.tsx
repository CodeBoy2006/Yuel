import type { DocumentState } from '@embedpdf/core';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import {
  AlertTriangle,
  FileText,
  FileUp,
  Link2,
  LoaderCircle,
  PanelRightOpen,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  FormEvent,
} from 'react';
import { browser } from 'wxt/browser';

import { BrandLockup } from '../../ui/primitives';
import type { PdfTextRunsEngine } from '../analytics';
import {
  isPdfSourceError,
  loadLocalPdfSource,
  loadRemotePdfSource,
} from '../source';
import type {
  PdfSourceHandle,
  PdfSourceMetadata,
  PdfSourceProgress,
} from '../source';
import {
  clearPdfReaderSession,
  publishPdfReaderSession,
} from '../sessionContext';
import {
  formatPdfOpenError,
  formatPdfSourceProgress,
} from './format';
import {
  DocumentToolbarControls,
  PdfDocumentView,
} from './PdfDocumentView';
import {
  PdfReaderSidebar,
  type PdfReaderPanelMode,
} from './PdfReaderSidebar';

export const LOCAL_PDF_MAX_BYTES = 256 * 1024 * 1024;
export const REMOTE_PDF_MAX_BYTES = 96 * 1024 * 1024;

type SourceActivity =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: PdfSourceProgress; source: 'local' | 'remote' }
  | { kind: 'opening'; source: 'local' | 'remote' }
  | { kind: 'error'; message: string };

export interface PdfReaderWorkspaceProps {
  activeDocument: DocumentState | null;
  activeDocumentId: string | null;
  engine: PdfTextRunsEngine;
  pluginsReady: boolean;
}

export function PdfReaderWorkspace({
  activeDocument,
  activeDocumentId,
  engine,
  pluginsReady,
}: PdfReaderWorkspaceProps) {
  const { provides: documentManager } = useDocumentManagerCapability();
  const [activity, setActivity] = useState<SourceActivity>({ kind: 'idle' });
  const [sourceMetadata, setSourceMetadata] = useState<PdfSourceMetadata>();
  const [remoteFormOpen, setRemoteFormOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [statsBusy, setStatsBusy] = useState(false);
  const [statsFailed, setStatsFailed] = useState(false);
  const [panelMode, setPanelMode] = useState<PdfReaderPanelMode | null>(null);
  const [focusSearchRequest, setFocusSearchRequest] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const loadSequenceRef = useRef(0);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  const isBusy = activity.kind === 'loading' || activity.kind === 'opening';
  const canOpenSource = pluginsReady && Boolean(documentManager) && !isBusy;
  const documentLoaded = activeDocument?.status === 'loaded';
  const displayName = sourceMetadata?.displayName
    ?? activeDocument?.name
    ?? '尚未打开 PDF';

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      loadSequenceRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setPanelMode(null);
  }, [activeDocumentId]);

  useEffect(() => {
    if (
      !documentLoaded
      || !sourceMetadata
      || sourceMetadata.resourceId !== activeDocumentId
    ) {
      return;
    }

    void publishPdfReaderSession(sourceMetadata).catch((error) => {
      console.warn('Failed to publish the active PDF reader session', error);
    });

    return () => {
      void clearPdfReaderSession(sourceMetadata.resourceId).catch(() => undefined);
    };
  }, [
    activeDocumentId,
    documentLoaded,
    sourceMetadata,
  ]);

  const showPanel = useCallback((mode: PdfReaderPanelMode) => {
    setPanelMode(mode);
    if (mode === 'search') {
      setFocusSearchRequest((request) => request + 1);
    }
  }, []);

  const togglePanel = useCallback((mode: PdfReaderPanelMode) => {
    if (panelMode === mode) {
      setPanelMode(null);
      return;
    }
    showPanel(mode);
  }, [panelMode, showPanel]);

  const openSearchPanel = useCallback(() => {
    showPanel('search');
  }, [showPanel]);

  const closePanelAfterNarrowNavigation = useCallback(() => {
    if (window.matchMedia?.('(max-width: 760px)').matches) {
      setPanelMode(null);
    }
  }, []);

  const openSource = useCallback(async (
    sourceKind: 'local' | 'remote',
    load: (
      signal: AbortSignal,
      onProgress: (progress: PdfSourceProgress) => void,
    ) => Promise<PdfSourceHandle>,
  ) => {
    if (!documentManager || isBusy) return;

    const requestId = ++loadSequenceRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let source: PdfSourceHandle | undefined;

    setActivity({
      kind: 'loading',
      source: sourceKind,
      progress: {
        stage: 'reading',
        loadedBytes: 0,
      },
    });

    const isCurrentRequest = () =>
      mountedRef.current && requestId === loadSequenceRef.current;

    try {
      source = await load(controller.signal, (progress) => {
        if (isCurrentRequest()) {
          setActivity({ kind: 'loading', source: sourceKind, progress });
        }
      });
      if (!isCurrentRequest()) return;

      setActivity({ kind: 'opening', source: sourceKind });
      await documentManager.closeAllDocuments().toPromise();
      if (!isCurrentRequest()) return;

      const metadata = source.metadata;
      const response = await documentManager.openDocumentBuffer({
        buffer: source.getBuffer(),
        name: metadata.displayName,
        documentId: metadata.resourceId,
        autoActivate: true,
      }).toPromise();

      setSourceMetadata(metadata);
      source.release();
      source = undefined;

      // Once registered, DocumentContent owns password prompts and PDFium parse errors.
      await response.task.toPromise().catch(() => undefined);

      if (isCurrentRequest()) setActivity({ kind: 'idle' });
    } catch (error) {
      if (!isCurrentRequest()) return;
      if (isPdfSourceError(error) && error.code === 'aborted') {
        setActivity({ kind: 'idle' });
      } else {
        setActivity({ kind: 'error', message: formatPdfOpenError(error) });
      }
    } finally {
      source?.release();
      if (requestId === loadSequenceRef.current) {
        abortControllerRef.current = undefined;
      }
    }
  }, [documentManager, isBusy]);

  const openLocalFile = useCallback((file: File) => {
    setRemoteFormOpen(false);
    void openSource('local', (signal, onProgress) =>
      loadLocalPdfSource(file, {
        maxBytes: LOCAL_PDF_MAX_BYTES,
        signal,
        onProgress,
      }));
  }, [openSource]);

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) openLocalFile(file);
  };

  const handleRemoteSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextUrl = remoteUrl.trim();
    if (!nextUrl || !canOpenSource) return;

    setRemoteFormOpen(false);
    void openSource('remote', (signal, onProgress) =>
      loadRemotePdfSource(nextUrl, {
        maxBytes: REMOTE_PDF_MAX_BYTES,
        signal,
        onProgress,
      }));
  };

  const cancelSourceLoad = () => {
    if (activity.kind !== 'loading') return;
    abortControllerRef.current?.abort();
  };

  const closeDocument = useCallback(async () => {
    loadSequenceRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
    setActivity({ kind: 'idle' });
    setSourceMetadata(undefined);
    setPanelMode(null);

    if (documentManager) {
      await documentManager.closeAllDocuments().toPromise().catch(() => undefined);
    }
  }, [documentManager]);

  const openStats = async () => {
    if (statsBusy) return;
    setStatsBusy(true);
    setStatsFailed(false);

    try {
      await openExtensionSidePanel();
    } catch {
      if (mountedRef.current) setStatsFailed(true);
    } finally {
      if (mountedRef.current) setStatsBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!canOpenSource) return;
    const file = Array.from(event.dataTransfer.files)
      .find((candidate) =>
        candidate.type === 'application/pdf'
        || candidate.name.toLowerCase().endsWith('.pdf'));
    if (file) openLocalFile(file);
  };

  return (
    <div
      className="pdf-reader yuel-app"
      onDragOver={(event) => {
        if (canOpenSource) event.preventDefault();
      }}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        className="pdf-reader__file-input"
        type="file"
        accept="application/pdf,.pdf"
        disabled={!canOpenSource}
        onChange={handleFileSelection}
      />

      <header className="pdf-reader__toolbar">
        <div className="pdf-reader__identity">
          <BrandLockup compact progressStatus="unavailable" />
          <span className="pdf-reader__toolbar-divider" aria-hidden="true" />
          <div className="pdf-reader__document-name">
            <FileText aria-hidden="true" />
            <span title={displayName}>{displayName}</span>
          </div>
        </div>

        {documentLoaded && activeDocumentId ? (
          <DocumentToolbarControls
            documentId={activeDocumentId}
            panelMode={panelMode}
            onTogglePanel={togglePanel}
          />
        ) : (
          <div className="pdf-reader__toolbar-status" role="status">
            {pluginsReady ? '阅读器就绪' : '正在初始化'}
          </div>
        )}

        <div className="pdf-reader__toolbar-actions">
          <button
            className="pdf-reader__toolbar-button"
            type="button"
            disabled={!canOpenSource}
            aria-expanded={remoteFormOpen}
            aria-controls="pdf-reader-remote-form"
            onClick={() => setRemoteFormOpen((open) => !open)}
          >
            <Link2 aria-hidden="true" />
            <span>链接</span>
          </button>
          <button
            className="pdf-reader__toolbar-button pdf-reader__toolbar-button--primary"
            type="button"
            disabled={!canOpenSource}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp aria-hidden="true" />
            <span>打开文件</span>
          </button>
          <button
            className="pdf-reader__icon-button"
            type="button"
            aria-label="打开阅读统计"
            title={statsFailed ? '统计面板打开失败，请重试' : '打开阅读统计'}
            disabled={statsBusy}
            onClick={() => void openStats()}
          >
            {statsBusy
              ? <LoaderCircle className="is-spinning" aria-hidden="true" />
              : <PanelRightOpen aria-hidden="true" />}
          </button>
        </div>

        {remoteFormOpen ? (
          <form
            id="pdf-reader-remote-form"
            className="pdf-reader__remote-form"
            onSubmit={handleRemoteSubmit}
          >
            <div className="pdf-reader__remote-form-heading">
              <div>
                <strong>打开远程 PDF</strong>
                <span>当前版本会完整下载文件，上限 96 MB。</span>
              </div>
              <button
                type="button"
                aria-label="关闭远程 PDF 输入"
                title="关闭"
                onClick={() => setRemoteFormOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <label>
              <span className="sr-only">远程 PDF 地址</span>
              <input
                autoFocus
                type="url"
                inputMode="url"
                placeholder="https://example.com/document.pdf"
                value={remoteUrl}
                onChange={(event) => setRemoteUrl(event.target.value)}
              />
            </label>
            <button
              className="pdf-reader__button pdf-reader__button--primary"
              type="submit"
              disabled={!remoteUrl.trim() || !canOpenSource}
            >
              <Link2 aria-hidden="true" />
              下载并打开
            </button>
          </form>
        ) : null}
      </header>

      <ReaderActivityBanner
        activity={activity}
        onCancel={cancelSourceLoad}
        onDismiss={() => setActivity({ kind: 'idle' })}
      />

      <main
        className="pdf-reader__workspace"
        data-panel-open={panelMode ? 'true' : 'false'}
      >
        {documentLoaded && activeDocumentId && panelMode ? (
          <PdfReaderSidebar
            documentId={activeDocumentId}
            focusSearchRequest={focusSearchRequest}
            mode={panelMode}
            onClose={() => setPanelMode(null)}
            onModeChange={showPanel}
            onNavigate={closePanelAfterNarrowNavigation}
          />
        ) : null}

        <div className="pdf-reader__document-stage">
          {activeDocumentId ? (
            <PdfDocumentView
              documentId={activeDocumentId}
              engine={engine}
              onCloseDocument={closeDocument}
              onOpenSearch={openSearchPanel}
              sourceMetadata={sourceMetadata?.resourceId === activeDocumentId
                ? sourceMetadata
                : undefined}
            />
          ) : (
            <ReaderEmptyState
              ready={canOpenSource}
              onOpenFile={() => fileInputRef.current?.click()}
              onOpenRemote={() => setRemoteFormOpen(true)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function ReaderActivityBanner({
  activity,
  onCancel,
  onDismiss,
}: {
  activity: SourceActivity;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  if (activity.kind === 'idle') return null;

  if (activity.kind === 'error') {
    return (
      <div className="pdf-reader__activity pdf-reader__activity--error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <span>{activity.message}</span>
        <button type="button" aria-label="关闭错误提示" title="关闭" onClick={onDismiss}>
          <X aria-hidden="true" />
        </button>
      </div>
    );
  }

  const message = activity.kind === 'opening'
    ? '正在交给 PDFium 打开文档'
    : formatPdfSourceProgress(activity.progress);
  const totalBytes = activity.kind === 'loading' ? activity.progress.totalBytes : undefined;
  const progress = activity.kind === 'loading' && totalBytes
    ? Math.min(1, activity.progress.loadedBytes / totalBytes)
    : undefined;

  return (
    <div className="pdf-reader__activity" role="status" aria-live="polite">
      <LoaderCircle className="is-spinning" aria-hidden="true" />
      <span>{message}</span>
      <span
        className="pdf-reader__activity-progress"
        style={progress === undefined
          ? undefined
          : ({ '--pdf-load-progress': progress } as LoadProgressStyle)}
        aria-hidden="true"
      />
      {activity.kind === 'loading' ? (
        <button type="button" onClick={onCancel}>取消</button>
      ) : null}
    </div>
  );
}

type LoadProgressStyle = CSSProperties & {
  '--pdf-load-progress': number;
};

function ReaderEmptyState({
  onOpenFile,
  onOpenRemote,
  ready,
}: {
  onOpenFile: () => void;
  onOpenRemote: () => void;
  ready: boolean;
}) {
  return (
    <section className="pdf-reader__empty" aria-busy={!ready}>
      <div className="pdf-reader__empty-mark" aria-hidden="true">
        {ready ? <FileText /> : <LoaderCircle className="is-spinning" />}
      </div>
      <p className="pdf-reader__empty-kicker">Yuel PDF Reader</p>
      <h1>{ready ? '打开 PDF，继续你的阅读' : '正在准备本地 PDF 引擎'}</h1>
      <p className="pdf-reader__empty-copy">
        文件内容只在当前设备处理。阅读统计复用现有本地优先数据流，不保存 PDF 文件本身。
      </p>
      <div className="pdf-reader__empty-actions">
        <button
          className="pdf-reader__button pdf-reader__button--primary"
          type="button"
          disabled={!ready}
          onClick={onOpenFile}
        >
          <FileUp aria-hidden="true" />
          打开本地 PDF
        </button>
        <button
          className="pdf-reader__button pdf-reader__button--secondary"
          type="button"
          disabled={!ready}
          onClick={onOpenRemote}
        >
          <Link2 aria-hidden="true" />
          输入远程链接
        </button>
      </div>
      <div className="pdf-reader__empty-trust">
        <ShieldCheck aria-hidden="true" />
        <span>PDFium WASM 与 Worker 均由扩展本地提供</span>
      </div>
    </section>
  );
}

async function openExtensionSidePanel(): Promise<void> {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: {
      sidePanel?: {
        open?: (options: { windowId?: number }) => Promise<void>;
      };
      windows?: {
        WINDOW_ID_CURRENT?: number;
      };
    };
  }).chrome;

  if (
    chromeApi?.sidePanel?.open
    && typeof chromeApi.windows?.WINDOW_ID_CURRENT === 'number'
  ) {
    try {
      await chromeApi.sidePanel.open({
        windowId: chromeApi.windows.WINDOW_ID_CURRENT,
      });
      return;
    } catch {
      // Opening the standalone side-panel page keeps statistics accessible.
    }
  }

  await browser.tabs.create({
    url: new URL('/sidepanel.html', window.location.href).toString(),
  });
}
