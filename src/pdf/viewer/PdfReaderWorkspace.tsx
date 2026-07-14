import type { DocumentState } from '@embedpdf/core';
import type { PdfEngine } from '@embedpdf/models';
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
import type { PdfDocumentStateRecord } from '../../storage/schema';
import {
  getPdfDocumentState,
  getRecentPdfDocumentStates,
} from '../documentState';
import {
  parsePdfReaderTarget,
  type PdfReaderTarget,
} from '../navigation';
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

interface PendingLocalDocument {
  state: PdfDocumentStateRecord;
  target?: PdfReaderTarget;
}

interface OpenSourceOptions {
  expectedDisplayName?: string;
  expectedResourceId?: string;
  target?: PdfReaderTarget;
}

export interface PdfReaderWorkspaceProps {
  activeDocument: DocumentState | null;
  activeDocumentId: string | null;
  engine: PdfEngine;
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
  const [documentTarget, setDocumentTarget] = useState<PdfReaderTarget>();
  const [recentDocuments, setRecentDocuments] = useState<PdfDocumentStateRecord[]>([]);
  const [pendingLocalDocument, setPendingLocalDocument] = useState<PendingLocalDocument>();
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
  const pendingLocalDocumentRef = useRef<PendingLocalDocument | undefined>(undefined);
  const launchTargetRef = useRef<PdfReaderTarget | undefined>(
    parsePdfReaderTarget(window.location.search),
  );
  const launchTargetHandledRef = useRef(false);

  const isBusy = activity.kind === 'loading' || activity.kind === 'opening';
  const canOpenSource = pluginsReady && Boolean(documentManager) && !isBusy;
  const documentLoaded = activeDocument?.status === 'loaded';
  const displayName = sourceMetadata?.displayName
    ?? activeDocument?.name
    ?? '尚未打开 PDF';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSequenceRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  const refreshRecentDocuments = useCallback(async () => {
    try {
      const documents = await getRecentPdfDocumentStates();
      if (mountedRef.current) setRecentDocuments(documents);
    } catch {
      if (mountedRef.current) setRecentDocuments([]);
    }
  }, []);

  useEffect(() => {
    void refreshRecentDocuments();
  }, [refreshRecentDocuments]);

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
    options: OpenSourceOptions = {},
  ): Promise<boolean> => {
    if (!documentManager || isBusy) return false;

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
      if (!isCurrentRequest()) return false;

      setActivity({ kind: 'opening', source: sourceKind });
      const metadata = source.metadata;
      if (
        options.expectedResourceId
        && metadata.resourceId !== options.expectedResourceId
      ) {
        throw new Error(
          `所选 PDF 与阅读记录不匹配。请重新选择“${
            options.expectedDisplayName ?? '原 PDF'
          }”。`,
        );
      }

      await documentManager.closeAllDocuments().toPromise();
      if (!isCurrentRequest()) return false;

      setDocumentTarget(options.target);
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
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      if (isPdfSourceError(error) && error.code === 'aborted') {
        setActivity({ kind: 'idle' });
      } else {
        setActivity({ kind: 'error', message: formatPdfOpenError(error) });
      }
      return false;
    } finally {
      source?.release();
      if (requestId === loadSequenceRef.current) {
        abortControllerRef.current = undefined;
      }
    }
  }, [documentManager, isBusy]);

  const openLocalFile = useCallback(async (
    file: File,
    pendingDocument?: PendingLocalDocument,
  ) => {
    setRemoteFormOpen(false);
    const opened = await openSource('local', (signal, onProgress) =>
      loadLocalPdfSource(file, {
        maxBytes: LOCAL_PDF_MAX_BYTES,
        signal,
        onProgress,
      }), pendingDocument ? {
        expectedDisplayName: pendingDocument.state.displayName,
        expectedResourceId: pendingDocument.state.resourceId,
        target: pendingDocument.target,
      } : undefined);

    if (opened && mountedRef.current) {
      pendingLocalDocumentRef.current = undefined;
      setPendingLocalDocument(undefined);
    }
  }, [openSource]);

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      void openLocalFile(file, pendingLocalDocumentRef.current);
    }
  };

  const requestLocalFile = useCallback((pendingDocument?: PendingLocalDocument) => {
    pendingLocalDocumentRef.current = pendingDocument;
    setPendingLocalDocument(pendingDocument);
    if (!pendingDocument) setDocumentTarget(undefined);
    fileInputRef.current?.click();
  }, []);

  const openRemoteDocument = useCallback((
    url: string,
    options?: OpenSourceOptions,
  ) => openSource('remote', (signal, onProgress) =>
    loadRemotePdfSource(url, {
      maxBytes: REMOTE_PDF_MAX_BYTES,
      signal,
      onProgress,
    }), options), [openSource]);

  const handleRemoteSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextUrl = remoteUrl.trim();
    if (!nextUrl || !canOpenSource) return;

    setRemoteFormOpen(false);
    pendingLocalDocumentRef.current = undefined;
    setPendingLocalDocument(undefined);
    setDocumentTarget(undefined);
    void openRemoteDocument(nextUrl);
  };

  const openRecentDocument = useCallback((state: PdfDocumentStateRecord) => {
    if (!canOpenSource) return;

    if (state.kind === 'remote' && state.sourceUrl) {
      pendingLocalDocumentRef.current = undefined;
      setPendingLocalDocument(undefined);
      setDocumentTarget(undefined);
      void openRemoteDocument(state.sourceUrl, {
        expectedDisplayName: state.displayName,
        expectedResourceId: state.resourceId,
      });
      return;
    }

    requestLocalFile({ state });
  }, [canOpenSource, openRemoteDocument, requestLocalFile]);

  useEffect(() => {
    const target = launchTargetRef.current;
    if (!target || launchTargetHandledRef.current || !canOpenSource) return;
    launchTargetHandledRef.current = true;

    void (async () => {
      try {
        const state = await getPdfDocumentState(target.resourceId);
        if (!mountedRef.current) return;

        if (!state) {
          setActivity({
            kind: 'error',
            message: '找不到这条 PDF 摘录对应的本地阅读记录。',
          });
          return;
        }

        if (state.kind === 'remote' && state.sourceUrl) {
          await openRemoteDocument(state.sourceUrl, {
            expectedDisplayName: state.displayName,
            expectedResourceId: state.resourceId,
            target,
          });
          return;
        }

        const pendingDocument = { state, target };
        pendingLocalDocumentRef.current = pendingDocument;
        setPendingLocalDocument(pendingDocument);
        setDocumentTarget(target);
      } catch {
        if (mountedRef.current) {
          setActivity({
            kind: 'error',
            message: '无法读取这条 PDF 摘录的本地记录，请稍后重试。',
          });
        }
      }
    })();
  }, [canOpenSource, openRemoteDocument]);

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
    setDocumentTarget(undefined);
    setPanelMode(null);

    if (documentManager) {
      await documentManager.closeAllDocuments().toPromise().catch(() => undefined);
    }
    await refreshRecentDocuments();
  }, [documentManager, refreshRecentDocuments]);

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
    if (file) {
      void openLocalFile(file, pendingLocalDocumentRef.current);
    }
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
            onClick={() => requestLocalFile()}
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
        {documentLoaded
          && activeDocumentId
          && activeDocument?.document
          && panelMode ? (
          <PdfReaderSidebar
            document={activeDocument.document}
            documentId={activeDocumentId}
            engine={engine}
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
              initialTarget={documentTarget}
              onCloseDocument={closeDocument}
              onDocumentStateReady={refreshRecentDocuments}
              onOpenSearch={openSearchPanel}
              sourceMetadata={sourceMetadata?.resourceId === activeDocumentId
                ? sourceMetadata
                : undefined}
            />
          ) : (
            <ReaderEmptyState
              pendingLocalDocument={pendingLocalDocument}
              ready={canOpenSource}
              recentDocuments={recentDocuments}
              onCancelPendingLocal={() => {
                pendingLocalDocumentRef.current = undefined;
                setPendingLocalDocument(undefined);
                setDocumentTarget(undefined);
              }}
              onOpenFile={() => requestLocalFile(pendingLocalDocument)}
              onOpenRemote={() => setRemoteFormOpen(true)}
              onOpenRecent={openRecentDocument}
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
  onCancelPendingLocal,
  onOpenFile,
  onOpenRemote,
  onOpenRecent,
  pendingLocalDocument,
  ready,
  recentDocuments,
}: {
  onCancelPendingLocal: () => void;
  onOpenFile: () => void;
  onOpenRemote: () => void;
  onOpenRecent: (state: PdfDocumentStateRecord) => void;
  pendingLocalDocument?: PendingLocalDocument;
  ready: boolean;
  recentDocuments: PdfDocumentStateRecord[];
}) {
  const pendingState = pendingLocalDocument?.state;

  return (
    <section className="pdf-reader__empty" aria-busy={!ready}>
      <div className="pdf-reader__empty-mark" aria-hidden="true">
        {ready ? <FileText /> : <LoaderCircle className="is-spinning" />}
      </div>
      <p className="pdf-reader__empty-kicker">Yuel PDF Reader</p>
      <h1>
        {!ready
          ? '正在准备本地 PDF 引擎'
          : pendingState
            ? `重新选择 ${pendingState.displayName}`
            : '打开 PDF，继续你的阅读'}
      </h1>
      <p className="pdf-reader__empty-copy">
        {pendingState
          ? 'Yuel 不保存本地 PDF 文件。重新选择原文件后，将校验内容并恢复到保存的位置。'
          : '文件内容只在当前设备处理。阅读统计复用现有本地优先数据流，不保存 PDF 文件本身。'}
      </p>
      <div className="pdf-reader__empty-actions">
        <button
          className="pdf-reader__button pdf-reader__button--primary"
          type="button"
          disabled={!ready}
          onClick={onOpenFile}
        >
          <FileUp aria-hidden="true" />
          {pendingState ? '选择原 PDF' : '打开本地 PDF'}
        </button>
        {pendingState ? (
          <button
            className="pdf-reader__button pdf-reader__button--secondary"
            type="button"
            onClick={onCancelPendingLocal}
          >
            <X aria-hidden="true" />
            取消
          </button>
        ) : (
          <button
            className="pdf-reader__button pdf-reader__button--secondary"
            type="button"
            disabled={!ready}
            onClick={onOpenRemote}
          >
            <Link2 aria-hidden="true" />
            输入远程链接
          </button>
        )}
      </div>
      {recentDocuments.length > 0 ? (
        <div className="pdf-reader__recent">
          <div className="pdf-reader__recent-heading">
            <strong>最近文档</strong>
            <span>最多显示 5 个</span>
          </div>
          <div className="pdf-reader__recent-list">
            {recentDocuments.map((documentState) => (
              <button
                key={documentState.resourceId}
                type="button"
                disabled={!ready}
                onClick={() => onOpenRecent(documentState)}
              >
                <FileText aria-hidden="true" />
                <span>
                  <strong title={documentState.displayName}>
                    {documentState.displayName}
                  </strong>
                  <small>
                    {documentState.kind === 'remote' ? '远程 PDF' : '本地 PDF'}
                    {' · '}
                    第 {documentState.pageIndex + 1} 页
                    {' · '}
                    {formatRecentDocumentTime(documentState.lastOpenedAt)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="pdf-reader__empty-trust">
        <ShieldCheck aria-hidden="true" />
        <span>PDFium WASM 与 Worker 均由扩展本地提供</span>
      </div>
    </section>
  );
}

function formatRecentDocumentTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '最近打开';

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
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
