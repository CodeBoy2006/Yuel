import { Clock3 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatLocalDate } from '../../src/domain/localDate';
import type {
  ReadingFocusSessionSummary,
  ReadingHistoryDay,
  ReadingSessionSourceSummary,
} from '../../src/storage/readingStats';
import { formatCount, formatMinutes } from '../../src/ui/formatters';
import { SectionHeader } from '../../src/ui/primitives';

interface ReadingDurationInsightsProps {
  history: ReadingHistoryDay[];
  sessions: ReadingFocusSessionSummary[];
}

type DurationRange = '14' | '30' | '91';

const MEANINGFUL_SESSION_MINUTES = 0.5;
const RANGE_OPTIONS: Array<{ label: string; value: DurationRange }> = [
  { label: '14 天', value: '14' },
  { label: '30 天', value: '30' },
  { label: '13 周', value: '91' },
];
const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
});
const sessionDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
  weekday: 'short',
});
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
});
const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

export function ReadingDurationInsights({
  history,
  sessions,
}: ReadingDurationInsightsProps) {
  const [range, setRange] = useState<DurationRange>('30');
  const normalizedHistory = useMemo(() => normalizeHistory(history), [history]);
  const visibleHistory = range === '91'
    ? normalizedHistory
    : normalizedHistory.slice(-Number(range));
  const visibleDates = new Set(visibleHistory.map((day) => day.date));
  const visibleSessions = sessions.filter((session) => (
    visibleDates.size === 0 || visibleDates.has(session.date)
  ));
  const meaningfulSessions = visibleSessions.filter(
    (session) => session.effectiveMinutes >= MEANINGFUL_SESSION_MINUTES,
  );
  const totalMinutes = visibleHistory.reduce((sum, day) => sum + day.minutes, 0);
  const activeDays = visibleHistory.filter((day) => day.minutes > 0);
  const averageActiveMinutes = activeDays.length ? totalMinutes / activeDays.length : 0;
  const longestSessionMinutes = meaningfulSessions.reduce(
    (longest, session) => Math.max(longest, session.effectiveMinutes),
    0,
  );
  const currentWeekMinutes = getCurrentWeekMinutes(normalizedHistory);
  const sourceTotals = summarizeSources(visibleSessions);

  return (
    <section
      id="reading-duration-insights"
      className="dashboard-panel reading-duration"
      aria-labelledby="reading-duration-title"
    >
      <SectionHeader icon={Clock3} meta={formatPeriodLabel(normalizedHistory)}>
        <span id="reading-duration-title" tabIndex={-1}>有效时长</span>
      </SectionHeader>

      <p className="reading-duration__method">
        由可见文本、前台焦点、空闲与滚动状态估算；相邻 5 分钟内的阅读合并为一次会话。
      </p>

      <dl className="reading-insights__summary reading-duration__summary" aria-label="有效阅读时长摘要">
        <DurationMetric
          label="区间累计"
          value={formatMinutes(totalMinutes)}
          detail={`本周 ${formatMinutes(currentWeekMinutes)}`}
        />
        <DurationMetric
          label="活跃日日均"
          value={formatMinutes(averageActiveMinutes)}
          detail={`${activeDays.length} 个活跃日`}
        />
        <DurationMetric label="专注会话" value={`${meaningfulSessions.length} 次`} />
        <DurationMetric
          label="最长会话"
          value={longestSessionMinutes > 0 ? formatMinutes(longestSessionMinutes) : '—'}
        />
      </dl>

      <div className="reading-duration__analysis">
        <DurationTrend
          history={visibleHistory}
          range={range}
          totalMinutes={totalMinutes}
          onRangeChange={setRange}
        />
        <SourceBreakdown sources={sourceTotals} />
      </div>

      <RecentSessions sessions={meaningfulSessions.slice(0, 5)} />
    </section>
  );
}

function DurationMetric({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

function DurationTrend({
  history,
  onRangeChange,
  range,
  totalMinutes,
}: {
  history: ReadingHistoryDay[];
  onRangeChange: (range: DurationRange) => void;
  range: DurationRange;
  totalMinutes: number;
}) {
  const maximumMinutes = Math.max(1, ...history.map((day) => day.minutes));
  const averageMinutes = history.length ? totalMinutes / history.length : 0;
  const firstDay = history[0];
  const middleDay = history[Math.floor((history.length - 1) / 2)];
  const lastDay = history.at(-1);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const plotMinWidth = Math.max(320, history.length * 8);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  }, [firstDay?.date, history.length, lastDay?.date, range]);

  return (
    <section className="reading-duration-trend" aria-labelledby="reading-duration-trend-title">
      <div className="reading-chart-heading reading-chart-heading--trend">
        <div>
          <h3 id="reading-duration-trend-title">每日有效时长</h3>
          <p>累计 {formatMinutes(totalMinutes)} · 日均 {formatMinutes(averageMinutes)}</p>
        </div>
        <div className="reading-trend__ranges" role="group" aria-label="有效时长范围">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => onRangeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="reading-duration-trend__scroller" ref={scrollerRef}>
        <div className="reading-duration-trend__canvas" style={{ minWidth: `${plotMinWidth}px` }}>
          <div
            className="reading-duration-trend__plot"
            role="img"
            aria-label={`每日有效时长柱状图，区间累计 ${formatMinutes(totalMinutes)}。`}
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, history.length)}, minmax(4px, 1fr))`,
            }}
          >
            {history.map((day) => (
              <span className="reading-duration-trend__day" key={day.date} aria-hidden="true">
                <span
                  style={{
                    height: day.minutes > 0
                      ? `${Math.max(2, day.minutes / maximumMinutes * 100)}%`
                      : '0',
                  }}
                  title={`${fullDateFormatter.format(parseLocalDate(day.date))}：${formatMinutes(day.minutes)}`}
                />
              </span>
            ))}
          </div>

          <div className="reading-duration-trend__axis" aria-hidden="true">
            <span>{firstDay ? monthDayFormatter.format(parseLocalDate(firstDay.date)) : '—'}</span>
            <span>{middleDay ? monthDayFormatter.format(parseLocalDate(middleDay.date)) : '—'}</span>
            <span>{lastDay ? monthDayFormatter.format(parseLocalDate(lastDay.date)) : '—'}</span>
          </div>
        </div>
      </div>

      {history.length > 0 ? (
        <details className="reading-duration-trend__details">
          <summary>逐日明细</summary>
          <ol aria-label="逐日有效时长">
            {[...history].reverse().map((day) => (
              <li key={day.date}>
                <time dateTime={day.date}>
                  {fullDateFormatter.format(parseLocalDate(day.date))}
                </time>
                <strong>{formatMinutes(day.minutes)}</strong>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function SourceBreakdown({ sources }: { sources: SourceTotal[] }) {
  const displayedSources = sources.slice(0, 5);
  const totalMinutes = sources.reduce((sum, source) => sum + source.effectiveMinutes, 0);

  return (
    <section className="reading-duration-sources" aria-labelledby="reading-duration-sources-title">
      <div className="reading-chart-heading reading-chart-heading--compact">
        <div>
          <h3 id="reading-duration-sources-title">时长来源</h3>
          <p>按有效时长汇总阅读网站与本地 PDF</p>
        </div>
      </div>

      {displayedSources.length > 0 ? (
        <ol className="reading-duration-sources__list">
          {displayedSources.map((source) => (
            <li key={source.key}>
              <div>
                <span title={source.domain}>{source.domain}</span>
                {source.resourceType === 'pdf' ? <small>PDF</small> : null}
                <strong>{formatMinutes(source.effectiveMinutes)}</strong>
              </div>
              <span className="reading-duration-sources__track" aria-hidden="true">
                <span style={{ width: `${source.effectiveMinutes / Math.max(1, totalMinutes) * 100}%` }} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="reading-duration__empty">暂无可分解的会话来源。</p>
      )}
    </section>
  );
}

function RecentSessions({ sessions }: { sessions: ReadingFocusSessionSummary[] }) {
  return (
    <section className="reading-duration-recent" aria-labelledby="reading-duration-recent-title">
      <div className="reading-chart-heading">
        <div>
          <h3 id="reading-duration-recent-title">最近会话</h3>
          <p>仅列出有效时长达到 30 秒的阅读会话</p>
        </div>
        <span>{sessions.length} 次</span>
      </div>

      {sessions.length > 0 ? (
        <ol className="reading-duration-recent__list">
          {sessions.map((session) => (
            <li key={session.id}>
              <div className="reading-duration-recent__time">
                <time dateTime={new Date(session.startedAt).toISOString()}>
                  {sessionDateFormatter.format(new Date(session.startedAt))}
                </time>
                <span>{timeFormatter.format(new Date(session.startedAt))}–{timeFormatter.format(new Date(session.endedAt))}</span>
              </div>
              <div className="reading-duration-recent__source">
                <strong>{formatSessionSources(session.sources)}</strong>
                <span>{session.pageCount} 个页面 · {formatCount(session.effectiveWords)} 个有效词</span>
              </div>
              <strong className="reading-duration-recent__value">
                {formatMinutes(session.effectiveMinutes)}
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="reading-duration__empty">暂无达到 30 秒的有效阅读会话。</p>
      )}
    </section>
  );
}

interface SourceTotal extends ReadingSessionSourceSummary {
  key: string;
}

function summarizeSources(sessions: ReadingFocusSessionSummary[]): SourceTotal[] {
  const totals = new Map<string, SourceTotal>();

  for (const session of sessions) {
    for (const source of session.sources) {
      const key = `${source.resourceType ?? 'web'}:${source.domain}`;
      const existing = totals.get(key);
      totals.set(key, {
        key,
        domain: source.domain,
        resourceType: source.resourceType,
        effectiveMinutes: (existing?.effectiveMinutes ?? 0) + source.effectiveMinutes,
      });
    }
  }

  return Array.from(totals.values()).sort(
    (left, right) => right.effectiveMinutes - left.effectiveMinutes,
  );
}

function getCurrentWeekMinutes(history: ReadingHistoryDay[]): number {
  const latestDate = history.at(-1)?.date;
  if (!latestDate) return 0;

  const latestDay = parseLocalDate(latestDate);
  const monday = new Date(latestDay);
  monday.setDate(latestDay.getDate() - (latestDay.getDay() + 6) % 7);
  const mondayDate = formatLocalDate(monday);
  return history
    .filter((day) => day.date >= mondayDate)
    .reduce((sum, day) => sum + day.minutes, 0);
}

function formatSessionSources(sources: ReadingSessionSourceSummary[]): string {
  const visibleDomains = sources.slice(0, 2).map((source) => source.domain);
  if (visibleDomains.length === 0) return '未知来源';
  const remainingCount = sources.length - visibleDomains.length;
  return remainingCount > 0
    ? `${visibleDomains.join(' · ')} 等 ${remainingCount + visibleDomains.length} 个来源`
    : visibleDomains.join(' · ');
}

function normalizeHistory(history: ReadingHistoryDay[]): ReadingHistoryDay[] {
  return history
    .map((day) => ({
      ...day,
      minutes: Math.max(0, day.minutes),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function formatPeriodLabel(history: ReadingHistoryDay[]): string {
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last) return '近 13 周';
  return `${monthDayFormatter.format(parseLocalDate(first.date))}–${monthDayFormatter.format(parseLocalDate(last.date))}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
