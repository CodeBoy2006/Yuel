import type {
  PdfBookmarkObject,
  PdfDocumentObject,
  PdfEngine,
} from '@embedpdf/models';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import {
  ChartNoAxesGantt,
  FileSearch,
  LoaderCircle,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';

import type {
  PdfReadingProgressMetrics,
} from '../analytics/progress';
import { formatCount, formatMinutes } from '../../ui/formatters';
import {
  createPdfChapterReadingProgress,
  createPdfReadingMapOverviewSegments,
  createPdfReadingMapVisuals,
  getPdfReadingMapEvidence,
} from './readingMap';
import type {
  PdfReadingMapVisual,
} from './readingMap';
import type { PdfReadingProgressState } from './usePdfReadingProgress';

type PdfReadingMapScale = 'pages' | 'chapters';

type PdfReadingMapItem = PdfReadingProgressMetrics & {
  chapterTitle?: string;
  endPageNumber: number;
  id: string;
  label: string;
  pageNumber: number;
  pageRangeLabel?: string;
};

type PdfReadingMapSegmentStyle = CSSProperties & {
  '--pdf-reading-coverage': number;
  '--pdf-reading-pace': number;
  '--pdf-reading-span': string;
};

type PdfReadingMapOverviewStyle = CSSProperties & {
  '--pdf-reading-overview-top': string;
  '--pdf-reading-overview-window': string;
};

type PdfReadingMapOverviewSegmentStyle = CSSProperties & {
  '--pdf-reading-overview-coverage': number;
};

const READING_TIME_LEVELS = [0, 1, 2, 3] as const;

export function PdfReadingMapPanel({
  document,
  documentId,
  engine,
  onNavigate,
  state,
}: {
  document: PdfDocumentObject;
  documentId: string;
  engine: Pick<PdfEngine, 'getBookmarks'>;
  onNavigate: () => void;
  state: PdfReadingProgressState;
}) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[]>([]);
  const [scale, setScale] = useState<PdfReadingMapScale>('chapters');
  const [inspectedItemId, setInspectedItemId] = useState<string>();
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setBookmarks([]);
    void engine.getBookmarks(document).toPromise()
      .then((result) => {
        if (active) setBookmarks(result.bookmarks ?? []);
      })
      .catch(() => {
        if (active) setBookmarks([]);
      });

    return () => {
      active = false;
    };
  }, [document, engine]);

  const chapters = useMemo(() => (
    state.status === 'ready'
      ? createPdfChapterReadingProgress(bookmarks, state.progress.pages)
      : []
  ), [bookmarks, state]);

  const pages = state.status === 'ready' ? state.progress.pages : [];
  const chapterTitlesByPage = useMemo(() => new Map(
    chapters.map((chapter) => [chapter.startPageNumber, chapter.title]),
  ), [chapters]);
  const pageItems = useMemo<PdfReadingMapItem[]>(() => pages.map((page) => ({
    ...page,
    chapterTitle: chapterTitlesByPage.get(page.pageNumber),
    endPageNumber: page.pageNumber,
    id: page.sectionId,
    label: `第 ${page.pageNumber} 页`,
    pageNumber: page.pageNumber,
  })), [chapterTitlesByPage, pages]);
  const chapterItems = useMemo<PdfReadingMapItem[]>(() => chapters.map((chapter) => ({
    ...chapter,
    endPageNumber: chapter.endPageNumber,
    id: chapter.id,
    label: chapter.title,
    pageNumber: chapter.startPageNumber,
    pageRangeLabel: chapter.startPageNumber === chapter.endPageNumber
      ? `第 ${chapter.startPageNumber} 页`
      : `${chapter.startPageNumber}–${chapter.endPageNumber} 页`,
  })), [chapters]);
  const effectiveScale = scale === 'chapters' && chapterItems.length > 0
    ? 'chapters'
    : 'pages';
  const items = effectiveScale === 'chapters' ? chapterItems : pageItems;
  const visuals = useMemo(
    () => createPdfReadingMapVisuals(
      effectiveScale === 'chapters' ? chapterItems : pageItems,
    ),
    [chapterItems, effectiveScale, pageItems],
  );
  const overviewSegments = useMemo(
    () => createPdfReadingMapOverviewSegments(pages),
    [pages],
  );
  const activeItemIndex = items.findIndex(
    (item) => isPageWithinMapItem(scrollState.currentPage, item),
  );
  const activeItem = items[activeItemIndex] ?? items[0];
  const inspectedItemIndex = items.findIndex((item) => item.id === inspectedItemId);
  const focusItemIndex = inspectedItemIndex >= 0
    ? inspectedItemIndex
    : Math.max(0, activeItemIndex);
  const focusItem = items[focusItemIndex] ?? activeItem;
  const focusVisual = visuals[focusItemIndex] ?? visuals[activeItemIndex] ?? visuals[0];

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeItem?.id, effectiveScale]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="pdf-reader__sidebar-state" role="status">
        <LoaderCircle className="is-spinning" aria-hidden="true" />
        <span>正在分析全文阅读覆盖</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="pdf-reader__sidebar-state" role="alert">
        <FileSearch aria-hidden="true" />
        <span>阅读地图暂时无法读取</span>
      </div>
    );
  }

  const { progress } = state;
  if (progress.totalWords <= 0) {
    return (
      <div className="pdf-reader__sidebar-state">
        <ChartNoAxesGantt aria-hidden="true" />
        <span>未识别到可测量的英文文本</span>
      </div>
    );
  }

  if (!focusItem || !focusVisual) {
    return (
      <div className="pdf-reader__sidebar-state">
        <ChartNoAxesGantt aria-hidden="true" />
        <span>暂无可展示的阅读结构</span>
      </div>
    );
  }

  const coveragePercent = Math.round((progress.coverageRatio ?? 0) * 100);
  const currentPage = Math.min(
    Math.max(1, scrollState.currentPage),
    Math.max(1, pages.length),
  );
  const overviewPosition = pages.length > 0
    ? ((currentPage - 0.5) / pages.length) * 100
    : 0;
  const overviewWindow = pages.length > 0
    ? Math.min(100, Math.max(4.5, 100 / pages.length))
    : 100;
  const overviewTop = Math.min(
    100 - overviewWindow,
    Math.max(0, overviewPosition - (overviewWindow / 2)),
  );
  const focusCoverage = formatReadingMapCoverage(focusVisual);
  const focusIsActive = focusItem.id === activeItem?.id;

  return (
    <section
      className="pdf-reader__reading-map"
      aria-label="PDF 阅读覆盖地图"
    >
      <header className="pdf-reader__reading-map-summary">
        <div className="pdf-reader__reading-map-summary-line">
          <p
            role="progressbar"
            aria-label="全文阅读覆盖"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={coveragePercent}
            aria-valuetext={`已覆盖 ${coveragePercent}%，${formatCount(
              progress.coveredWords,
            )} / ${formatCount(progress.totalWords)} 词`}
          >
            <strong>已覆盖 {coveragePercent}%</strong>
            <span>{formatCount(progress.coveredWords)} / {formatCount(progress.totalWords)} 词</span>
          </p>
          {chapters.length > 0 ? (
            <div
              className="pdf-reader__reading-map-scale"
              role="group"
              aria-label="阅读地图尺度"
            >
              <button
                type="button"
                aria-pressed={effectiveScale === 'chapters'}
                onClick={() => {
                  setInspectedItemId(undefined);
                  setScale('chapters');
                }}
              >
                章节
              </button>
              <button
                type="button"
                aria-pressed={effectiveScale === 'pages'}
                onClick={() => {
                  setInspectedItemId(undefined);
                  setScale('pages');
                }}
              >
                页面
              </button>
            </div>
          ) : null}
        </div>
        <p className="pdf-reader__reading-map-summary-meta">
          <span>有效 {formatReadingTime(progress.effectiveReadingMs)}</span>
          <span>{formatReadingPace(progress.wordsPerMinute)}</span>
        </p>
      </header>

      <section className="pdf-reader__reading-map-focus" aria-label="阅读位置详情">
        <header>
          <div>
            <span>{focusIsActive ? '当前位置' : '查看'}</span>
            <strong title={focusItem.label}>{focusItem.label}</strong>
            <small>
              {effectiveScale === 'chapters'
                ? focusItem.pageRangeLabel
                : `${formatCount(focusItem.totalWords)} 词`}
            </small>
          </div>
          <strong>{focusCoverage}</strong>
        </header>
        <dl>
          <div>
            <dt>文本</dt>
            <dd>{formatCount(focusItem.coveredWords)} / {formatCount(focusItem.totalWords)}</dd>
          </div>
          <div>
            <dt>有效</dt>
            <dd>{formatReadingTime(focusItem.effectiveReadingMs)}</dd>
          </div>
          <div>
            <dt>节奏</dt>
            <dd>{formatReadingPace(focusItem.wordsPerMinute, '样本不足')}</dd>
          </div>
        </dl>
      </section>

      <div
        className="pdf-reader__reading-map-body"
        onPointerLeave={() => setInspectedItemId(undefined)}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setInspectedItemId(undefined);
          }
        }}
      >
        <div className="pdf-reader__reading-map-river-scroll">
          <div className="pdf-reader__reading-map-river">
            {items.map((item, index) => {
              const visual = visuals[index]!;
              const active = item.id === activeItem?.id;
              const coverage = formatReadingMapCoverage(visual);
              const rowStyle = {
                '--pdf-reading-coverage': visual.coverageRatio,
                '--pdf-reading-pace': visual.paceRatio ?? 0.5,
                '--pdf-reading-span': `${getReadingMapSpan(visual, effectiveScale)}px`,
              } as PdfReadingMapSegmentStyle;

              return (
                <button
                  key={item.id}
                  ref={active ? activeItemRef : undefined}
                  className="pdf-reader__reading-map-segment"
                  type="button"
                  style={rowStyle}
                  data-evidence={visual.evidence}
                  aria-current={active ? 'location' : undefined}
                  aria-label={formatReadingMapItemLabel(item, visual)}
                  onPointerEnter={() => setInspectedItemId(item.id)}
                  onFocus={() => setInspectedItemId(item.id)}
                  onClick={() => {
                    scroll?.scrollToPage({
                      pageNumber: item.pageNumber,
                      behavior: 'smooth',
                      alignY: 0,
                    });
                    onNavigate();
                  }}
                >
                  <span className="pdf-reader__reading-map-index" aria-hidden="true">
                    {effectiveScale === 'pages'
                      ? item.pageNumber
                      : String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="pdf-reader__reading-map-stream" aria-hidden="true">
                    <span />
                  </span>
                  <span className="pdf-reader__reading-map-segment-content">
                    {effectiveScale === 'pages' && item.chapterTitle ? (
                      <span className="pdf-reader__reading-map-chapter">
                        {item.chapterTitle}
                      </span>
                    ) : null}
                    <span className="pdf-reader__reading-map-segment-heading">
                      <strong>
                        {effectiveScale === 'chapters'
                          ? item.label
                          : `${formatCount(item.totalWords)} 词`}
                      </strong>
                      <small>
                        {effectiveScale === 'chapters'
                          ? `${item.pageRangeLabel} · ${formatCount(item.totalWords)} 词`
                          : item.label}
                      </small>
                    </span>
                    <span className="pdf-reader__reading-map-evidence" aria-hidden="true">
                      <span className="pdf-reader__reading-map-time">
                        {READING_TIME_LEVELS.map((level) => (
                          <i
                            key={level}
                            data-filled={level < visual.timeLevel ? 'true' : 'false'}
                          />
                        ))}
                      </span>
                      <span className="pdf-reader__reading-map-pace">
                        {visual.paceRatio === undefined ? null : <i />}
                      </span>
                    </span>
                  </span>
                  <span className="pdf-reader__reading-map-coverage">
                    {coverage}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside
          className="pdf-reader__reading-map-overview"
          style={{
            '--pdf-reading-overview-top': `${overviewTop}%`,
            '--pdf-reading-overview-window': `${overviewWindow}%`,
          } as PdfReadingMapOverviewStyle}
          aria-hidden="true"
        >
          <div>
            {overviewSegments.map((segment) => (
              <span
                key={segment.id}
                className="pdf-reader__reading-map-overview-segment"
                data-evidence={getPdfReadingMapEvidence(segment)}
                style={{
                  '--pdf-reading-overview-coverage': segment.coverageRatio ?? 0,
                  flexGrow: segment.endPageNumber - segment.startPageNumber + 1,
                } as PdfReadingMapOverviewSegmentStyle}
              >
                <i />
              </span>
            ))}
            <div className="pdf-reader__reading-map-overview-window" />
          </div>
          <small>{currentPage}</small>
        </aside>
      </div>
    </section>
  );
}

function formatReadingMapCoverage(
  visual: PdfReadingMapVisual,
): string {
  if (visual.evidence === 'no-text') return '不可测';
  if (visual.evidence === 'unrecorded') return '未记录';
  return `${Math.round(visual.coverageRatio * 100)}%`;
}

function formatReadingMapItemLabel(
  item: PdfReadingMapItem,
  visual: PdfReadingMapVisual,
): string {
  return [
    item.label,
    item.pageRangeLabel,
    `覆盖 ${formatReadingMapCoverage(visual)}`,
    `文本 ${formatCount(item.coveredWords)} / ${formatCount(item.totalWords)} 词`,
    `有效阅读 ${formatReadingTime(item.effectiveReadingMs)}`,
    `节奏 ${formatReadingPace(item.wordsPerMinute, '样本不足')}`,
  ].filter(Boolean).join('，');
}

function isPageWithinMapItem(
  pageNumber: number,
  item: PdfReadingMapItem,
): boolean {
  return pageNumber >= item.pageNumber && pageNumber <= item.endPageNumber;
}

function getReadingMapSpan(
  visual: PdfReadingMapVisual,
  scale: PdfReadingMapScale,
): number {
  const minimum = scale === 'chapters' ? 68 : 52;
  const range = scale === 'chapters' ? 54 : 28;
  return Math.round(minimum + (visual.textRatio * range));
}

function formatReadingTime(milliseconds: number): string {
  if (milliseconds <= 0) return '0 分钟';
  return formatMinutes(milliseconds / 60_000);
}

function formatReadingPace(
  wordsPerMinute: number | undefined,
  fallback = '节奏数据不足',
): string {
  return wordsPerMinute === undefined
    ? fallback
    : `${formatCount(wordsPerMinute)} WPM`;
}
