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
  useState,
} from 'react';
import type { CSSProperties } from 'react';

import type {
  PdfReadingProgressMetrics,
} from '../analytics/progress';
import { formatCount, formatMinutes } from '../../ui/formatters';
import {
  createPdfChapterReadingProgress,
} from './readingMap';
import type { PdfReadingProgressState } from './usePdfReadingProgress';

type PdfReadingMapMetric = 'coverage' | 'words' | 'time' | 'pace';
type PdfReadingMapGrouping = 'pages' | 'chapters';

type PdfReadingMapItem = PdfReadingProgressMetrics & {
  endPageNumber: number;
  id: string;
  label: string;
  pageNumber: number;
  pageRangeLabel?: string;
};

type PdfReadingMapBarStyle = CSSProperties & {
  '--pdf-reading-value': number;
};

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
  const [grouping, setGrouping] = useState<PdfReadingMapGrouping>('pages');
  const [metric, setMetric] = useState<PdfReadingMapMetric>('coverage');

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

  useEffect(() => {
    if (grouping === 'chapters' && chapters.length === 0) {
      setGrouping('pages');
    }
  }, [chapters.length, grouping]);

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

  const pageItems: PdfReadingMapItem[] = progress.pages.map((page) => ({
    ...page,
    endPageNumber: page.pageNumber,
    id: page.sectionId,
    label: `第 ${page.pageNumber} 页`,
    pageNumber: page.pageNumber,
  }));
  const chapterItems: PdfReadingMapItem[] = chapters.map((chapter) => ({
    ...chapter,
    endPageNumber: chapter.endPageNumber,
    id: chapter.id,
    label: chapter.title,
    pageNumber: chapter.startPageNumber,
    pageRangeLabel: chapter.startPageNumber === chapter.endPageNumber
      ? `第 ${chapter.startPageNumber} 页`
      : `${chapter.startPageNumber}–${chapter.endPageNumber} 页`,
  }));
  const items = grouping === 'chapters' ? chapterItems : pageItems;
  const maximum = getReadingMapMetricMaximum(items, metric);
  const coveragePercent = Math.round((progress.coverageRatio ?? 0) * 100);

  return (
    <section className="pdf-reader__reading-map" aria-label="PDF 阅读覆盖地图">
      <header className="pdf-reader__reading-map-summary">
        <div>
          <strong>{coveragePercent}%</strong>
          <span>累计覆盖估算</span>
        </div>
        <dl>
          <div>
            <dt>文本</dt>
            <dd>{formatCount(progress.coveredWords)} / {formatCount(progress.totalWords)} 词</dd>
          </div>
          <div>
            <dt>有效时间</dt>
            <dd>{formatMinutes(progress.effectiveReadingMs / 60_000)}</dd>
          </div>
          <div>
            <dt>有效节奏</dt>
            <dd>{progress.wordsPerMinute === undefined
              ? '数据不足'
              : `${formatCount(progress.wordsPerMinute)} WPM`}</dd>
          </div>
        </dl>
      </header>

      <div className="pdf-reader__reading-map-controls">
        <div
          className="pdf-reader__reading-map-segments"
          role="group"
          aria-label="图表指标"
        >
          {([
            ['coverage', '覆盖'],
            ['words', '词量'],
            ['time', '时间'],
            ['pace', '节奏'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {chapters.length > 0 ? (
          <div
            className="pdf-reader__reading-map-grouping"
            role="group"
            aria-label="阅读地图分组"
          >
            <button
              type="button"
              aria-pressed={grouping === 'pages'}
              onClick={() => setGrouping('pages')}
            >
              页面
            </button>
            <button
              type="button"
              aria-pressed={grouping === 'chapters'}
              onClick={() => setGrouping('chapters')}
            >
              章节
            </button>
          </div>
        ) : null}
      </div>

      <div className="pdf-reader__reading-map-list">
        {items.map((item) => {
          const presentation = getReadingMapPresentation(item, metric, maximum);
          const active = grouping === 'pages'
            ? item.pageNumber === scrollState.currentPage
            : isPageWithinMapItem(scrollState.currentPage, item);

          return (
            <button
              key={item.id}
              className="pdf-reader__reading-map-row"
              type="button"
              data-active={active ? 'true' : 'false'}
              data-empty={presentation.empty ? 'true' : 'false'}
              aria-current={active ? 'location' : undefined}
              aria-label={`${item.label}，${presentation.accessibleLabel}`}
              onClick={() => {
                scroll?.scrollToPage({
                  pageNumber: item.pageNumber,
                  behavior: 'smooth',
                  alignY: 0,
                });
                onNavigate();
              }}
            >
              <span className="pdf-reader__reading-map-row-heading">
                <strong title={item.label}>{item.label}</strong>
                <small>{item.pageRangeLabel ?? `${formatCount(item.totalWords)} 词`}</small>
              </span>
              <span
                className="pdf-reader__reading-map-track"
                style={{
                  '--pdf-reading-value': presentation.ratio,
                } as PdfReadingMapBarStyle}
                aria-hidden="true"
              >
                <span />
              </span>
              <span className="pdf-reader__reading-map-row-value">
                <strong>{presentation.label}</strong>
                <small>
                  {item.totalWords <= 0
                    ? '无可测文本'
                    : `${formatCount(item.coveredWords)} / ${formatCount(item.totalWords)} 词`
                      + ` · ${formatCompactReadingTime(item.effectiveReadingMs)}`}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function getReadingMapMetricMaximum(
  items: PdfReadingMapItem[],
  metric: PdfReadingMapMetric,
): number {
  if (metric === 'coverage') return 1;
  return Math.max(1, ...items.map((item) => getReadingMapMetricValue(item, metric) ?? 0));
}

function getReadingMapPresentation(
  item: PdfReadingMapItem,
  metric: PdfReadingMapMetric,
  maximum: number,
): {
  accessibleLabel: string;
  empty: boolean;
  label: string;
  ratio: number;
} {
  if (item.totalWords <= 0) {
    return {
      accessibleLabel: '无可测文本',
      empty: true,
      label: '不可测',
      ratio: 0,
    };
  }

  const hasRecordedReading = item.coveredWords > 0 || item.effectiveReadingMs > 0;
  if (!hasRecordedReading) {
    return {
      accessibleLabel: '尚未记录有效阅读',
      empty: true,
      label: '未记录',
      ratio: 0,
    };
  }

  const value = getReadingMapMetricValue(item, metric);
  if (value === undefined) {
    return {
      accessibleLabel: '阅读节奏数据不足',
      empty: true,
      label: '数据不足',
      ratio: 0,
    };
  }

  const ratio = Math.min(1, Math.max(0, value / Math.max(1, maximum)));
  if (metric === 'coverage') {
    const percent = Math.round(value * 100);
    return {
      accessibleLabel: `覆盖估算 ${percent}%`,
      empty: false,
      label: `${percent}%`,
      ratio,
    };
  }
  if (metric === 'words') {
    const label = `${formatCount(value)} 词`;
    return {
      accessibleLabel: `累计覆盖 ${label}`,
      empty: false,
      label,
      ratio,
    };
  }
  if (metric === 'time') {
    const label = formatCompactReadingTime(value);
    return {
      accessibleLabel: `有效阅读 ${label}`,
      empty: false,
      label,
      ratio,
    };
  }

  const label = `${formatCount(value)} WPM`;
  return {
    accessibleLabel: `有效阅读节奏 ${label}`,
    empty: false,
    label,
    ratio,
  };
}

function getReadingMapMetricValue(
  item: PdfReadingMapItem,
  metric: PdfReadingMapMetric,
): number | undefined {
  if (metric === 'coverage') return item.coverageRatio;
  if (metric === 'words') return item.coveredWords;
  if (metric === 'time') return item.effectiveReadingMs;
  return item.wordsPerMinute;
}

function isPageWithinMapItem(
  pageNumber: number,
  item: PdfReadingMapItem,
): boolean {
  return pageNumber >= item.pageNumber && pageNumber <= item.endPageNumber;
}

function formatCompactReadingTime(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1_000;
  if (seconds <= 0) return '0 分钟';
  if (seconds < 60) return '< 1 分钟';
  return formatMinutes(seconds / 60);
}
