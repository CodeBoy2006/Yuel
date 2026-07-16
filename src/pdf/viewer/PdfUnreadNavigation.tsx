import type { Rotation } from '@embedpdf/models';
import type {
  ScrollMetrics,
  ScrollScope,
} from '@embedpdf/plugin-scroll';
import { ScanSearch } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { shouldIgnorePdfReaderShortcut } from './keyboard';
import type { PdfReadingProgressState } from './usePdfReadingProgress';
import {
  findNextUnreadPdfChunk,
  type PdfUnreadLocation,
  type PdfUnreadTarget,
} from './unreadNavigation';

type PdfUnreadNavigationNotice = {
  kind: 'complete' | 'end' | 'success';
  message: string;
};

export function PdfNextUnreadControl({
  currentPage,
  documentId,
  onTargetChange,
  readingProgressState,
  rotation,
  scroll,
}: {
  currentPage: number;
  documentId: string;
  onTargetChange: (target: PdfUnreadTarget | undefined) => void;
  readingProgressState: PdfReadingProgressState;
  rotation: Rotation;
  scroll: ScrollScope | null;
}) {
  const [notice, setNotice] = useState<PdfUnreadNavigationNotice>();
  const cursorRef = useRef<PdfUnreadLocation | undefined>(undefined);
  const requestIdRef = useRef(0);
  const noticeTimerRef = useRef<number | undefined>(undefined);
  const readyProgress = readingProgressState.status === 'ready'
    ? readingProgressState.progress
    : undefined;
  const unreadAvailable = useMemo(() => (
    readyProgress
      ? Boolean(findNextUnreadPdfChunk(readyProgress, {
          pageNumber: readyProgress.pages[0]?.pageNumber ?? 1,
          pageY: 0,
          documentRotation: rotation,
        }))
      : false
  ), [readyProgress, rotation]);
  const canNavigate = Boolean(
    scroll
    && readyProgress
    && readyProgress.totalWords > 0,
  );

  const clearNotice = useCallback(() => {
    if (noticeTimerRef.current !== undefined) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = undefined;
    }
    setNotice(undefined);
  }, []);

  const showNotice = useCallback((
    nextNotice: PdfUnreadNavigationNotice,
    timeoutMs?: number,
  ) => {
    if (noticeTimerRef.current !== undefined) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setNotice(nextNotice);
    noticeTimerRef.current = timeoutMs === undefined
      ? undefined
      : window.setTimeout(() => {
          noticeTimerRef.current = undefined;
          setNotice(undefined);
        }, timeoutMs);
  }, []);

  useEffect(() => {
    cursorRef.current = undefined;
    requestIdRef.current = 0;
    clearNotice();
    onTargetChange(undefined);
  }, [clearNotice, documentId, onTargetChange]);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (
      cursor
      && currentPage > 0
      && currentPage !== cursor.pageNumber
    ) {
      cursorRef.current = undefined;
      onTargetChange(undefined);
      clearNotice();
    }
  }, [clearNotice, currentPage, onTargetChange]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== undefined) {
      window.clearTimeout(noticeTimerRef.current);
    }
  }, []);

  const focusLocation = useCallback((location: PdfUnreadLocation) => {
    if (!scroll) return;

    cursorRef.current = location;
    onTargetChange({
      ...location,
      requestId: ++requestIdRef.current,
    });
    scroll.scrollToPage({
      pageNumber: location.pageNumber,
      ...(location.pageCoordinates
        ? { pageCoordinates: location.pageCoordinates }
        : {}),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      alignY: 20,
    });
    showNotice({
      kind: 'success',
      message: `已定位到第 ${location.pageNumber} 页未读内容`,
    }, 2_400);
  }, [onTargetChange, scroll, showNotice]);

  const navigateToNext = useCallback(() => {
    if (!scroll || !readyProgress) return;

    const cursor = cursorRef.current;
    const activePage = Math.max(1, cursor?.pageNumber ?? currentPage ?? 1);
    const target = findNextUnreadPdfChunk(readyProgress, cursor
      ? {
          pageNumber: activePage,
          afterChunkId: cursor.chunkId,
          documentRotation: rotation,
        }
      : {
          pageNumber: activePage,
          pageY: getCurrentDisplayedPageY(
            activePage,
            scroll.getMetrics(),
          ),
          documentRotation: rotation,
        });

    if (target) {
      focusLocation(target);
      return;
    }

    onTargetChange(undefined);
    const firstUnread = findNextUnreadPdfChunk(readyProgress, {
      pageNumber: readyProgress.pages[0]?.pageNumber ?? 1,
      pageY: 0,
      documentRotation: rotation,
    });
    showNotice(firstUnread
      ? {
          kind: 'end',
          message: '当前位置之后没有未读内容',
        }
      : {
          kind: 'complete',
          message: '当前可测文本已覆盖',
        }, firstUnread ? undefined : 2_800);
  }, [
    currentPage,
    focusLocation,
    onTargetChange,
    readyProgress,
    rotation,
    scroll,
    showNotice,
  ]);

  const restartFromBeginning = useCallback(() => {
    if (!readyProgress) return;
    const target = findNextUnreadPdfChunk(readyProgress, {
      pageNumber: readyProgress.pages[0]?.pageNumber ?? 1,
      pageY: 0,
      documentRotation: rotation,
    });
    if (!target) return;

    cursorRef.current = undefined;
    focusLocation(target);
  }, [focusLocation, readyProgress, rotation]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.metaKey
        || event.ctrlKey
        || event.altKey
        || event.shiftKey
        || event.key.toLowerCase() !== 'n'
        || shouldIgnorePdfReaderShortcut(event.target)
        || !canNavigate
      ) {
        return;
      }

      event.preventDefault();
      navigateToNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canNavigate, navigateToNext]);

  return (
    <div className="pdf-reader__unread-control">
      <button
        className="pdf-reader__icon-button pdf-reader__context-tool"
        type="button"
        aria-describedby={notice ? 'pdf-reader-unread-status' : undefined}
        aria-label="下一处未读内容"
        data-unread-available={unreadAvailable ? 'true' : 'false'}
        title={getButtonTitle(readingProgressState, unreadAvailable)}
        disabled={!canNavigate}
        onClick={navigateToNext}
      >
        <ScanSearch aria-hidden="true" />
      </button>
      {notice ? (
        <div
          id="pdf-reader-unread-status"
          className="pdf-reader__unread-notice"
          data-kind={notice.kind}
          role="status"
          aria-live="polite"
        >
          <span>{notice.message}</span>
          {notice.kind === 'end' ? (
            <button type="button" onClick={restartFromBeginning}>
              从开头查找
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PdfUnreadTargetHighlightLayer({
  pageIndex,
  scale,
  target,
}: {
  pageIndex: number;
  scale: number;
  target?: PdfUnreadTarget;
}) {
  if (!target || target.pageIndex !== pageIndex) return null;

  return (
    <div
      className="pdf-reader__unread-target-layer"
      data-pdf-unread-target={target.chunkId}
      data-request-id={target.requestId}
      aria-hidden="true"
    >
      {target.sourceRects.length > 0 ? (
        target.sourceRects.map((rect, index) => (
          <span
            className="pdf-reader__unread-target-highlight"
            key={`${target.requestId}:${index}`}
            style={{
              left: rect.origin.x * scale,
              top: rect.origin.y * scale,
              width: rect.size.width * scale,
              height: rect.size.height * scale,
            }}
          />
        ))
      ) : (
        <span
          className="pdf-reader__unread-target-highlight pdf-reader__unread-target-highlight--page"
          key={target.requestId}
          style={{
            left: 14 * scale,
            top: 14 * scale,
            width: `calc(100% - ${28 * scale}px)`,
          }}
        />
      )}
    </div>
  );
}

function getButtonTitle(
  state: PdfReadingProgressState,
  unreadAvailable: boolean,
): string {
  if (state.status === 'idle' || state.status === 'loading') {
    return '正在分析未读内容';
  }
  if (state.status === 'error') {
    return '未读导航暂时不可用';
  }
  if (state.progress.totalWords <= 0) {
    return '未识别到可导航的英文文本';
  }
  return unreadAvailable
    ? '下一处未读内容 · N'
    : '当前可测文本已覆盖 · N';
}

function getCurrentDisplayedPageY(
  currentPage: number,
  metrics: ScrollMetrics,
): number {
  const visibility = metrics.pageVisibilityMetrics.find((candidate) =>
    candidate.pageNumber === currentPage);
  return visibility?.original.pageY ?? 0;
}
