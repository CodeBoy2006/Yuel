import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatLocalDate } from '../../src/domain/localDate';
import type { ReadingHistoryDay } from '../../src/storage/readingStats';
import { formatCount } from '../../src/ui/formatters';
import {
  createHeatmapIntensityScale,
  getHeatmapIntensityLevel,
  HEATMAP_LEVEL_COUNT,
} from '../../src/ui/heatmapIntensity';
import { SectionHeader } from '../../src/ui/primitives';

interface ReadingInsightsProps {
  dailyGoal: number;
  history: ReadingHistoryDay[];
}

type TrendRange = '14' | '30' | '91';

const HEATMAP_WEEKS = 13;
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const TREND_RANGE_OPTIONS: Array<{ label: string; value: TrendRange }> = [
  { label: '14 天', value: '14' },
  { label: '30 天', value: '30' },
  { label: '13 周', value: '91' },
];
const CHART_WIDTH = 720;
const CHART_HEIGHT = 236;
const CHART_PADDING = { top: 18, right: 16, bottom: 16, left: 52 };
const compactNumberFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const monthFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'short' });
const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

export function ReadingInsights({ dailyGoal, history }: ReadingInsightsProps) {
  const normalizedHistory = useMemo(() => normalizeHistory(history), [history]);
  const activeDays = normalizedHistory.filter((day) => day.effectiveWords > 0);
  const totalWords = activeDays.reduce((sum, day) => sum + day.effectiveWords, 0);
  const averageActiveWords = activeDays.length ? totalWords / activeDays.length : 0;
  const completedDays = normalizedHistory.filter((day) => day.checkInCompleted).length;
  const bestDay = activeDays.reduce<ReadingHistoryDay | undefined>(
    (best, day) => !best || day.effectiveWords > best.effectiveWords ? day : best,
    undefined,
  );
  const periodLabel = formatPeriodLabel(normalizedHistory);

  return (
    <section id="reading-insights" className="dashboard-panel reading-insights" aria-labelledby="reading-insights-title">
      <SectionHeader icon={Activity} meta={periodLabel}>
        <span id="reading-insights-title" tabIndex={-1}>阅读节律</span>
      </SectionHeader>

      <dl className="reading-insights__summary" aria-label="近十三周阅读摘要">
        <InsightMetric label="活跃日" value={`${activeDays.length} 天`} />
        <InsightMetric label="活跃日日均" value={`${formatCount(averageActiveWords)} 词`} />
        <InsightMetric label="达标日" value={`${completedDays} 天`} />
        <InsightMetric
          label="最佳一日"
          value={bestDay ? `${formatCount(bestDay.effectiveWords)} 词` : '—'}
          detail={bestDay ? monthDayFormatter.format(parseLocalDate(bestDay.date)) : undefined}
        />
      </dl>

      <ReadingHeatmap
        history={normalizedHistory}
      />

      <div className="reading-insights__charts">
        <TrendChart dailyGoal={dailyGoal} history={normalizedHistory} />
        <div className="reading-insights__side-charts">
          <WeekdayChart history={normalizedHistory} />
          <CompositionChart history={normalizedHistory} />
        </div>
      </div>
    </section>
  );
}

function InsightMetric({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

function ReadingHeatmap({
  history,
}: {
  history: ReadingHistoryDay[];
}) {
  const weeks = createHeatmapWeeks(history);
  const visibleDays = weeks.flat().filter((day) => !day.future);
  const totalWords = visibleDays.reduce((sum, day) => sum + day.effectiveWords, 0);
  const activeDays = visibleDays.filter((day) => day.effectiveWords > 0).length;
  const intensityScale = createHeatmapIntensityScale(
    visibleDays.map((day) => day.effectiveWords),
  );

  return (
    <section className="reading-heatmap" aria-labelledby="reading-heatmap-title">
      <div className="reading-chart-heading">
        <div>
          <h3 id="reading-heatmap-title">阅读活动热力图</h3>
          <p>颜色按近十三周每日有效词量自适应分级，空白代表当天没有有效阅读。</p>
        </div>
        <span>{formatCount(totalWords)} 词</span>
      </div>

      <div
        className="reading-heatmap__scroller"
        role="img"
        aria-label={`近十三周阅读活动热力图，共 ${activeDays} 个活跃日，累计 ${formatCount(totalWords)} 个有效词。颜色越深表示相对阅读量越多。`}
      >
        <div className="reading-heatmap__plot">
          <div className="reading-heatmap__weekdays" aria-hidden="true">
            <span />
            {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="reading-heatmap__weeks" aria-hidden="true">
            {weeks.map((week, weekIndex) => (
              <div className="reading-heatmap__week" key={week[0]?.date ?? weekIndex}>
                <span className="reading-heatmap__month">{getWeekMonthLabel(week, weekIndex)}</span>
                {week.map((day) => (
                  <span
                    key={day.date}
                    className={`reading-heatmap__cell${day.future ? ' is-future' : ''}`}
                    data-date={day.date}
                    data-level={day.future
                      ? undefined
                      : getHeatmapIntensityLevel(day.effectiveWords, intensityScale)}
                    title={day.future ? undefined : formatHeatmapDayTitle(day)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="reading-heatmap__legend" aria-hidden="true">
        <span>少</span>
        {Array.from({ length: HEATMAP_LEVEL_COUNT + 1 }, (_, level) => (
          <i key={level} className="reading-heatmap__cell" data-level={level} />
        ))}
        <span>多</span>
      </div>
    </section>
  );
}

function TrendChart({ dailyGoal, history }: { dailyGoal: number; history: ReadingHistoryDay[] }) {
  const [range, setRange] = useState<TrendRange>('30');
  const rangeDays = Number(range);
  const visibleHistory = range === '91' ? history : history.slice(-rangeDays);
  const geometry = createTrendGeometry(visibleHistory, dailyGoal);
  const totalWords = visibleHistory.reduce((sum, day) => sum + day.effectiveWords, 0);
  const averageWords = visibleHistory.length ? totalWords / visibleHistory.length : 0;
  const firstDay = visibleHistory[0];
  const middleDay = visibleHistory[Math.floor((visibleHistory.length - 1) / 2)];
  const lastDay = visibleHistory.at(-1);

  return (
    <section className="reading-trend" aria-labelledby="reading-trend-title">
      <div className="reading-chart-heading reading-chart-heading--trend">
        <div>
          <h3 id="reading-trend-title">有效阅读趋势</h3>
          <p id="reading-trend-description">
            累计 {formatCount(totalWords)} 词 · 日均 {formatCount(averageWords)} 词
          </p>
        </div>
        <div className="reading-trend__ranges" role="group" aria-label="趋势时间范围">
          {TREND_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="reading-trend__plot">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-labelledby="reading-trend-title reading-trend-description"
        >
          {geometry.gridLines.map((gridLine) => (
            <g key={gridLine.value}>
              <line
                className="reading-trend__grid-line"
                x1={CHART_PADDING.left}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y1={gridLine.y}
                y2={gridLine.y}
              />
              <text className="reading-trend__axis-label" x={CHART_PADDING.left - 9} y={gridLine.y + 4} textAnchor="end">
                {compactNumberFormatter.format(gridLine.value)}
              </text>
            </g>
          ))}
          <line
            className="reading-trend__goal-line"
            x1={CHART_PADDING.left}
            x2={CHART_WIDTH - CHART_PADDING.right}
            y1={geometry.goalY}
            y2={geometry.goalY}
          />
          <text
            className="reading-trend__goal-label"
            x={CHART_WIDTH - CHART_PADDING.right}
            y={Math.max(CHART_PADDING.top + 11, geometry.goalY - 6)}
            textAnchor="end"
          >
            目标 {compactNumberFormatter.format(dailyGoal)}
          </text>
          {geometry.areaPath ? <path className="reading-trend__area" d={geometry.areaPath} /> : null}
          {geometry.linePath ? <path className="reading-trend__line" d={geometry.linePath} /> : null}
          {geometry.points.map((point, index) => {
            const showPoint = visibleHistory.length <= 31 || index % 7 === 0 || index === geometry.points.length - 1;
            if (!showPoint) return null;

            return (
              <circle className="reading-trend__point" key={point.date} cx={point.x} cy={point.y} r={2.5}>
                <title>{`${fullDateFormatter.format(parseLocalDate(point.date))}：${formatCount(point.value)} 个有效词`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="reading-trend__date-axis" aria-hidden="true">
          <span>{firstDay ? monthDayFormatter.format(parseLocalDate(firstDay.date)) : '—'}</span>
          <span>{middleDay ? monthDayFormatter.format(parseLocalDate(middleDay.date)) : '—'}</span>
          <span>{lastDay ? monthDayFormatter.format(parseLocalDate(lastDay.date)) : '—'}</span>
        </div>
      </div>
    </section>
  );
}

function WeekdayChart({ history }: { history: ReadingHistoryDay[] }) {
  const weekdays = summarizeWeekdays(history);
  const maxAverage = Math.max(1, ...weekdays.map((day) => day.averageWords));
  const strongestDay = weekdays.reduce((best, day) => day.averageWords > best.averageWords ? day : best, weekdays[0]);
  const chartLabel = strongestDay?.averageWords
    ? `按星期计算的日均有效词柱状图，星期${strongestDay.label}最高，为 ${formatCount(strongestDay.averageWords)} 词。`
    : '按星期计算的日均有效词柱状图，目前没有有效阅读。';

  return (
    <section className="weekday-chart" aria-labelledby="weekday-chart-title">
      <div className="reading-chart-heading reading-chart-heading--compact">
        <div>
          <h3 id="weekday-chart-title">一周节律</h3>
          <p>按星期统计日均有效词</p>
        </div>
      </div>
      <div className="weekday-chart__plot" role="img" aria-label={chartLabel}>
        {weekdays.map((day) => (
          <div className="weekday-chart__column" key={day.label}>
            <span className="weekday-chart__value">{compactNumberFormatter.format(day.averageWords)}</span>
            <span className="weekday-chart__track" aria-hidden="true">
              <span style={{ height: `${(day.averageWords / maxAverage) * 100}%` }} />
            </span>
            <span className="weekday-chart__label">{day.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompositionChart({ history }: { history: ReadingHistoryDay[] }) {
  const totalWords = history.reduce((sum, day) => sum + day.effectiveWords, 0);
  const newWords = Math.min(totalWords, history.reduce((sum, day) => sum + day.newWords, 0));
  const reviewWords = Math.min(totalWords - newWords, history.reduce((sum, day) => sum + day.reviewWords, 0));
  const unclassifiedWords = Math.max(0, totalWords - newWords - reviewWords);
  const composition = [
    { color: 'var(--insight-new)', label: '首次输入', value: newWords },
    { color: 'var(--insight-review)', label: '复习输入', value: reviewWords },
    { color: 'var(--insight-unclassified)', label: '历史未分类', value: unclassifiedWords },
  ].filter((item) => item.value > 0 || totalWords === 0);
  const ringBackground = createConicGradient(composition, totalWords);
  const compositionLabel = totalWords
    ? composition
        .filter((item) => item.value > 0)
        .map((item) => `${item.label} ${Math.round((item.value / totalWords) * 100)}%`)
        .join('，')
    : '目前没有可分析的有效词输入。';

  return (
    <section className="composition-chart" aria-labelledby="composition-chart-title">
      <div className="reading-chart-heading reading-chart-heading--compact">
        <div>
          <h3 id="composition-chart-title">输入构成</h3>
          <p>首次接触与复习词量</p>
        </div>
      </div>
      <div className="composition-chart__body" role="img" aria-label={`近十三周输入构成：${compositionLabel}`}>
        <div className="composition-chart__ring" style={{ background: ringBackground }} aria-hidden="true">
          <span>
            <strong>{compactNumberFormatter.format(totalWords)}</strong>
            <small>有效词</small>
          </span>
        </div>
        <ul className="composition-chart__legend" aria-hidden="true">
          {composition.map((item) => (
            <li key={item.label}>
              <i style={{ background: item.color }} />
              <span>{item.label}</span>
              <strong>{totalWords ? `${Math.round((item.value / totalWords) * 100)}%` : '0%'}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface HeatmapDay extends ReadingHistoryDay {
  future?: boolean;
}

function normalizeHistory(history: ReadingHistoryDay[]): ReadingHistoryDay[] {
  return history
    .map((day) => ({
      ...day,
      effectiveWords: Math.max(0, day.effectiveWords),
      minutes: Math.max(0, day.minutes),
      newWords: Math.max(0, day.newWords),
      reviewWords: Math.max(0, day.reviewWords),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function createHeatmapWeeks(history: ReadingHistoryDay[]): HeatmapDay[][] {
  const latestDate = history.at(-1)?.date ?? formatLocalDate(new Date());
  const latestDay = parseLocalDate(latestDate);
  latestDay.setHours(12, 0, 0, 0);
  const daysSinceMonday = (latestDay.getDay() + 6) % 7;
  const firstMonday = new Date(latestDay);
  firstMonday.setDate(latestDay.getDate() - daysSinceMonday - (HEATMAP_WEEKS - 1) * 7);
  const historyByDate = new Map(history.map((day) => [day.date, day]));
  const days: HeatmapDay[] = [];

  for (let offset = 0; offset < HEATMAP_WEEKS * 7; offset += 1) {
    const date = new Date(firstMonday);
    date.setDate(firstMonday.getDate() + offset);
    const dateKey = formatLocalDate(date);
    const savedDay = historyByDate.get(dateKey);
    const future = date > latestDay;
    days.push(savedDay ?? {
      date: dateKey,
      effectiveWords: 0,
      minutes: 0,
      newWords: 0,
      reviewWords: 0,
      checkInCompleted: false,
      future,
    });
  }

  return Array.from({ length: HEATMAP_WEEKS }, (_, index) => days.slice(index * 7, index * 7 + 7));
}

function getWeekMonthLabel(week: HeatmapDay[], weekIndex: number): string {
  const monthStart = week.find((day) => parseLocalDate(day.date).getDate() === 1);
  if (monthStart) return monthFormatter.format(parseLocalDate(monthStart.date));
  return weekIndex === 0 && week[0] ? monthFormatter.format(parseLocalDate(week[0].date)) : '';
}

function formatHeatmapDayTitle(day: ReadingHistoryDay): string {
  const reading = day.effectiveWords > 0 ? `${formatCount(day.effectiveWords)} 个有效词` : '没有有效阅读';
  const minutes = day.minutes > 0 ? `，约 ${formatCount(day.minutes)} 分钟` : '';
  return `${fullDateFormatter.format(parseLocalDate(day.date))}：${reading}${minutes}`;
}

function createTrendGeometry(history: ReadingHistoryDay[], dailyGoal: number) {
  const plotBottom = CHART_HEIGHT - CHART_PADDING.bottom;
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = plotBottom - CHART_PADDING.top;
  const maximumValue = Math.max(dailyGoal, ...history.map((day) => day.effectiveWords), 1);
  const axisMaximum = getNiceMaximum(maximumValue);
  const getY = (value: number) => CHART_PADDING.top + plotHeight * (1 - value / axisMaximum);
  const points = history.map((day, index) => ({
    date: day.date,
    value: day.effectiveWords,
    x: history.length <= 1
      ? CHART_PADDING.left + plotWidth / 2
      : CHART_PADDING.left + (plotWidth * index) / (history.length - 1),
    y: getY(day.effectiveWords),
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = points.length
    ? `${linePath} L ${points.at(-1)?.x ?? CHART_PADDING.left} ${plotBottom} L ${points[0]?.x ?? CHART_PADDING.left} ${plotBottom} Z`
    : '';
  const gridValues = [axisMaximum, axisMaximum / 2, 0];

  return {
    areaPath,
    linePath,
    points,
    goalY: getY(Math.min(axisMaximum, dailyGoal)),
    gridLines: gridValues.map((value) => ({ value, y: getY(value) })),
  };
}

function getNiceMaximum(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return rounded * magnitude;
}

function summarizeWeekdays(history: ReadingHistoryDay[]) {
  const totals = WEEKDAY_LABELS.map((label) => ({ averageWords: 0, count: 0, label, totalWords: 0 }));

  for (const day of history) {
    const index = (parseLocalDate(day.date).getDay() + 6) % 7;
    const weekday = totals[index];
    if (!weekday) continue;
    weekday.count += 1;
    weekday.totalWords += day.effectiveWords;
  }

  return totals.map((day) => ({
    ...day,
    averageWords: day.count ? Math.round(day.totalWords / day.count) : 0,
  }));
}

function createConicGradient(
  composition: Array<{ color: string; value: number }>,
  totalWords: number,
): string {
  if (totalWords <= 0) return 'var(--y-surface-strong)';

  let cursor = 0;
  const stops = composition
    .filter((item) => item.value > 0)
    .map((item) => {
      const start = cursor;
      cursor += (item.value / totalWords) * 100;
      return `${item.color} ${start}% ${cursor}%`;
    });
  return `conic-gradient(${stops.join(', ')})`;
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
