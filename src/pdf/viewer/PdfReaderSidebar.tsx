import {
  MatchFlag,
  type PdfBookmarkObject,
  type PdfDocumentObject,
  type PdfEngine,
  type SearchResult,
} from '@embedpdf/models';
import { useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/react';
import { useSearch } from '@embedpdf/plugin-search/react';
import {
  ThumbImg,
  ThumbnailsPane,
} from '@embedpdf/plugin-thumbnail/react';
import type { ThumbMeta } from '@embedpdf/plugin-thumbnail';
import { useZoom } from '@embedpdf/plugin-zoom/react';
import {
  CaseSensitive,
  ChartNoAxesGantt,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Images,
  ListTree,
  LoaderCircle,
  Search as SearchIcon,
  WholeWord,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
  getPdfOutlineDestination,
} from './outline';
import { PdfReadingMapPanel } from './PdfReadingMapPanel';
import {
  getPdfSearchResultAnchor,
  groupPdfSearchResults,
} from './searchResults';
import type { PdfReadingProgressState } from './usePdfReadingProgress';

export type PdfReaderPanelMode = 'progress' | 'outline' | 'thumbnails' | 'search';

interface PdfReaderSidebarProps {
  document: PdfDocumentObject;
  documentId: string;
  engine: Pick<PdfEngine, 'getBookmarks'>;
  focusSearchRequest: number;
  mode: PdfReaderPanelMode;
  onClose: () => void;
  onModeChange: (mode: PdfReaderPanelMode) => void;
  onNavigate: () => void;
  readingProgressState: PdfReadingProgressState;
}

export function PdfReaderSidebar({
  document,
  documentId,
  engine,
  focusSearchRequest,
  mode,
  onClose,
  onModeChange,
  onNavigate,
  readingProgressState,
}: PdfReaderSidebarProps) {
  return (
    <>
      <aside
        id="pdf-reader-context-panel"
        className="pdf-reader__sidebar"
        data-mode={mode}
        aria-label="PDF 导航面板"
      >
        <header className="pdf-reader__sidebar-header">
          <div
            className="pdf-reader__sidebar-tabs"
            role="tablist"
            aria-label="导航内容"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'progress'}
              title="阅读地图"
              onClick={() => onModeChange('progress')}
            >
              <ChartNoAxesGantt aria-hidden="true" />
              <span>阅读</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'outline'}
              title="目录"
              onClick={() => onModeChange('outline')}
            >
              <ListTree aria-hidden="true" />
              <span>目录</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'thumbnails'}
              title="缩略图"
              onClick={() => onModeChange('thumbnails')}
            >
              <Images aria-hidden="true" />
              <span>缩略图</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'search'}
              title="搜索文档"
              onClick={() => onModeChange('search')}
            >
              <SearchIcon aria-hidden="true" />
              <span>搜索</span>
            </button>
          </div>
          <button
            className="pdf-reader__sidebar-close"
            type="button"
            aria-label="关闭导航面板"
            title="关闭"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="pdf-reader__sidebar-content">
          {mode === 'progress' ? (
            <PdfReadingMapPanel
              document={document}
              documentId={documentId}
              engine={engine}
              onNavigate={onNavigate}
              state={readingProgressState}
            />
          ) : mode === 'outline' ? (
            <PdfOutlinePanel
              document={document}
              documentId={documentId}
              engine={engine}
              onNavigate={onNavigate}
            />
          ) : mode === 'thumbnails' ? (
            <PdfThumbnailPanel
              documentId={documentId}
              onNavigate={onNavigate}
            />
          ) : (
            <PdfSearchPanel
              documentId={documentId}
              focusRequest={focusSearchRequest}
              onClose={onClose}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </aside>
      <button
        className="pdf-reader__sidebar-backdrop"
        type="button"
        aria-label="关闭导航面板"
        onClick={onClose}
      />
    </>
  );
}

type PdfOutlineLoadState =
  | { status: 'loading' }
  | { status: 'ready'; bookmarks: PdfBookmarkObject[] }
  | { status: 'error' };

function PdfOutlinePanel({
  document,
  documentId,
  engine,
  onNavigate,
}: {
  document: PdfDocumentObject;
  documentId: string;
  engine: Pick<PdfEngine, 'getBookmarks'>;
  onNavigate: () => void;
}) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { provides: zoom } = useZoom(documentId);
  const [outlineState, setOutlineState] = useState<PdfOutlineLoadState>({
    status: 'loading',
  });

  useEffect(() => {
    let active = true;
    setOutlineState({ status: 'loading' });

    void engine.getBookmarks(document).toPromise()
      .then((result) => {
        if (active) {
          setOutlineState({
            status: 'ready',
            bookmarks: result.bookmarks ?? [],
          });
        }
      })
      .catch(() => {
        if (active) setOutlineState({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [document, engine]);

  const navigateToBookmark = useCallback((bookmark: PdfBookmarkObject) => {
    const destination = getPdfOutlineDestination(bookmark);
    if (!destination || !scroll) return;

    if (destination.zoom !== undefined) {
      zoom?.requestZoom(destination.zoom);
    }
    scroll.scrollToPage({
      pageNumber: destination.pageIndex + 1,
      behavior: 'smooth',
      alignY: 0,
    });
    onNavigate();
  }, [onNavigate, scroll, zoom]);

  if (outlineState.status === 'loading') {
    return (
      <div className="pdf-reader__sidebar-state" role="status">
        <LoaderCircle className="is-spinning" aria-hidden="true" />
        <span>正在读取章节目录</span>
      </div>
    );
  }

  if (outlineState.status === 'error') {
    return (
      <div className="pdf-reader__sidebar-state" role="alert">
        <FileSearch aria-hidden="true" />
        <span>章节目录读取失败</span>
      </div>
    );
  }

  if (outlineState.bookmarks.length === 0) {
    return (
      <div className="pdf-reader__sidebar-state">
        <ListTree aria-hidden="true" />
        <span>此 PDF 未包含章节目录</span>
      </div>
    );
  }

  return (
    <nav className="pdf-reader__outline-panel" aria-label="PDF 章节目录">
      <PdfOutlineItems
        bookmarks={outlineState.bookmarks}
        currentPage={scrollState.currentPage}
        onActivate={navigateToBookmark}
      />
    </nav>
  );
}

function PdfOutlineItems({
  bookmarks,
  currentPage,
  onActivate,
  path = 'root',
}: {
  bookmarks: PdfBookmarkObject[];
  currentPage: number;
  onActivate: (bookmark: PdfBookmarkObject) => void;
  path?: string;
}) {
  return (
    <ul className="pdf-reader__outline-list">
      {bookmarks.map((bookmark, index) => {
        const itemPath = `${path}-${index}`;
        const destination = getPdfOutlineDestination(bookmark);
        const pageNumber = destination ? destination.pageIndex + 1 : undefined;
        const active = pageNumber === currentPage;
        const title = bookmark.title.trim() || '未命名章节';

        return (
          <li className="pdf-reader__outline-item" key={itemPath}>
            <button
              type="button"
              disabled={!destination}
              aria-current={active ? 'location' : undefined}
              title={pageNumber ? `${title} · 第 ${pageNumber} 页` : title}
              onClick={() => onActivate(bookmark)}
            >
              <span>{title}</span>
              {pageNumber ? <small>{pageNumber}</small> : null}
            </button>
            {bookmark.children?.length ? (
              <PdfOutlineItems
                bookmarks={bookmark.children}
                currentPage={currentPage}
                onActivate={onActivate}
                path={itemPath}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function PdfThumbnailPanel({
  documentId,
  onNavigate,
}: {
  documentId: string;
  onNavigate: () => void;
}) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);

  return (
    <ThumbnailsPane
      documentId={documentId}
      className="pdf-reader__thumbnail-pane"
    >
      {(meta: ThumbMeta) => {
        const pageNumber = meta.pageIndex + 1;
        const active = scrollState.currentPage === pageNumber;

        return (
          <button
            key={meta.pageIndex}
            className="pdf-reader__thumbnail"
            type="button"
            data-active={active ? 'true' : 'false'}
            aria-current={active ? 'page' : undefined}
            aria-label={`前往第 ${pageNumber} 页`}
            style={{
              height: meta.wrapperHeight,
              top: meta.top,
            }}
            onClick={() => {
              scroll?.scrollToPage({
                pageNumber,
                behavior: 'smooth',
                alignY: 0,
              });
              onNavigate();
            }}
          >
            <span
              className="pdf-reader__thumbnail-frame"
              style={{
                width: meta.width,
                height: meta.height,
              }}
            >
              <ThumbImg
                documentId={documentId}
                meta={meta}
                draggable={false}
                aria-hidden="true"
              />
            </span>
            <span
              className="pdf-reader__thumbnail-label"
              style={{ height: meta.labelHeight }}
            >
              {pageNumber}
            </span>
          </button>
        );
      }}
    </ThumbnailsPane>
  );
}

function PdfSearchPanel({
  documentId,
  focusRequest,
  onClose,
  onNavigate,
}: {
  documentId: string;
  focusRequest: number;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const { state, provides: search } = useSearch(documentId);
  const { provides: scroll } = useScrollCapability();
  const [query, setQuery] = useState(state.query);
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(
    () => groupPdfSearchResults(state.results),
    [state.results],
  );
  const scrollScope = useMemo(
    () => scroll?.forDocument(documentId),
    [documentId, scroll],
  );

  useEffect(() => {
    setQuery(state.query);
  }, [documentId, state.query]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  useEffect(() => {
    if (!search) return;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      search.stopSearch();
      return;
    }

    const timer = window.setTimeout(() => {
      search.searchAllPages(trimmedQuery);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    return () => search?.stopSearch();
  }, [search]);

  const scrollToResult = useCallback((index: number) => {
    const result = state.results[index];
    if (!result || !scrollScope) return;

    const pageCoordinates = getPdfSearchResultAnchor(result);
    scrollScope.scrollToPage({
      pageNumber: result.pageIndex + 1,
      ...(pageCoordinates ? { pageCoordinates } : {}),
      behavior: 'smooth',
      alignX: 50,
      alignY: 50,
    });
  }, [scrollScope, state.results]);

  useEffect(() => {
    if (state.loading || state.activeResultIndex < 0) return;
    scrollToResult(state.activeResultIndex);
  }, [
    scrollToResult,
    state.activeResultIndex,
    state.loading,
  ]);

  const activateResult = (index: number) => {
    if (index < 0) return;
    search?.goToResult(index);
    scrollToResult(index);
    onNavigate();
  };

  const activateAdjacentResult = (direction: 'previous' | 'next') => {
    const index = direction === 'previous'
      ? search?.previousResult()
      : search?.nextResult();
    if (typeof index !== 'number' || index < 0) return;
    scrollToResult(index);
    onNavigate();
  };

  const toggleFlag = (flag: MatchFlag) => {
    if (!search) return;
    search.setFlags(
      state.flags.includes(flag)
        ? state.flags.filter((candidate) => candidate !== flag)
        : [...state.flags, flag],
    );
  };

  const handleInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (state.total > 0) {
      activateAdjacentResult(event.shiftKey ? 'previous' : 'next');
    } else if (query.trim()) {
      search?.searchAllPages(query.trim());
    }
  };

  const clearQuery = () => {
    setQuery('');
    search?.stopSearch();
    inputRef.current?.focus();
  };

  return (
    <section className="pdf-reader__search-panel" aria-label="全文搜索">
      <div className="pdf-reader__search-form">
        <label className="pdf-reader__search-input">
          <SearchIcon aria-hidden="true" />
          <span className="sr-only">搜索 PDF 内容</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="搜索 PDF 内容"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {query ? (
            <button
              type="button"
              aria-label="清除搜索"
              title="清除"
              onClick={clearQuery}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <div className="pdf-reader__search-options" aria-label="搜索选项">
          <button
            type="button"
            aria-pressed={state.flags.includes(MatchFlag.MatchCase)}
            title="区分大小写"
            onClick={() => toggleFlag(MatchFlag.MatchCase)}
          >
            <CaseSensitive aria-hidden="true" />
            <span>大小写</span>
          </button>
          <button
            type="button"
            aria-pressed={state.flags.includes(MatchFlag.MatchWholeWord)}
            title="全词匹配"
            onClick={() => toggleFlag(MatchFlag.MatchWholeWord)}
          >
            <WholeWord aria-hidden="true" />
            <span>全词</span>
          </button>
        </div>

        <div className="pdf-reader__search-summary" aria-live="polite">
          <span>
            {state.loading
              ? '正在搜索'
              : state.active
                ? `${state.total} 个结果`
                : '全文搜索'}
          </span>
          {state.total > 0 ? (
            <span className="pdf-reader__search-navigation">
              <output>
                {state.activeResultIndex + 1} / {state.total}
              </output>
              <button
                type="button"
                aria-label="上一个搜索结果"
                title="上一个结果"
                onClick={() => activateAdjacentResult('previous')}
              >
                <ChevronUp aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="下一个搜索结果"
                title="下一个结果"
                onClick={() => activateAdjacentResult('next')}
              >
                <ChevronDown aria-hidden="true" />
              </button>
            </span>
          ) : null}
        </div>
      </div>

      <div className="pdf-reader__search-results">
        {state.loading && state.results.length === 0 ? (
          <div className="pdf-reader__sidebar-state" role="status">
            <LoaderCircle className="is-spinning" aria-hidden="true" />
            <span>正在检索文档文字</span>
          </div>
        ) : null}

        {!state.loading && !state.active ? (
          <div className="pdf-reader__sidebar-state">
            <FileSearch aria-hidden="true" />
            <span>输入关键词以搜索全部页面</span>
          </div>
        ) : null}

        {!state.loading && state.active && state.total === 0 ? (
          <div className="pdf-reader__sidebar-state">
            <FileSearch aria-hidden="true" />
            <span>没有找到匹配内容</span>
          </div>
        ) : null}

        {state.active ? groups.map((group) => (
          <section
            key={group.pageIndex}
            className="pdf-reader__search-group"
            aria-label={`第 ${group.pageIndex + 1} 页搜索结果`}
          >
            <h3>第 {group.pageIndex + 1} 页</h3>
            <div>
              {group.hits.map(({ index, result }) => (
                <PdfSearchResultButton
                  key={`${result.pageIndex}-${result.charIndex}-${index}`}
                  active={index === state.activeResultIndex}
                  result={result}
                  onClick={() => activateResult(index)}
                />
              ))}
            </div>
          </section>
        )) : null}
      </div>
    </section>
  );
}

function PdfSearchResultButton({
  active,
  result,
  onClick,
}: {
  active: boolean;
  result: SearchResult;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [active]);

  return (
    <button
      ref={ref}
      className="pdf-reader__search-result"
      type="button"
      data-active={active ? 'true' : 'false'}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      <span>
        {result.context.truncatedLeft ? '… ' : null}
        {result.context.before}
        <strong>{result.context.match}</strong>
        {result.context.after}
        {result.context.truncatedRight ? ' …' : null}
      </span>
    </button>
  );
}
