import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { ReadingDurationInsights } from '../../entrypoints/dashboard/ReadingDurationInsights';
import { formatLocalDate } from '../domain/localDate';
import type {
  ReadingFocusSessionSummary,
  ReadingHistoryDay,
} from '../storage/readingStats';
import { renderForSmoke } from './renderTest';

describe('ReadingDurationInsights', () => {
  it('switches the daily duration summary between supported ranges', async () => {
    const container = await renderForSmoke(
      <ReadingDurationInsights history={createHistory(31)} sessions={[]} />,
    );

    expect(container.querySelector('.reading-duration__summary dd')?.textContent).toBe('30 分钟');

    const fourteenDayButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '14 天',
    );
    expect(fourteenDayButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      fourteenDayButton?.click();
    });

    expect(container.querySelector('.reading-duration__summary dd')?.textContent).toBe('14 分钟');
    expect(fourteenDayButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the date axis aligned with the scrollable plot and opens on the latest days', async () => {
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.classList.contains('reading-duration-trend__scroller') ? 300 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        if (!this.classList.contains('reading-duration-trend__scroller')) return 0;
        const canvas = (this as HTMLElement).querySelector<HTMLElement>('.reading-duration-trend__canvas');
        return Number.parseFloat(canvas?.style.minWidth ?? '0');
      },
    });

    try {
      const container = await renderForSmoke(
        <ReadingDurationInsights history={createHistory(91)} sessions={[]} />,
      );
      const thirteenWeekButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === '13 周',
      );
      expect(thirteenWeekButton).toBeInstanceOf(HTMLButtonElement);
      await act(async () => {
        thirteenWeekButton?.click();
      });

      const scroller = container.querySelector<HTMLElement>('.reading-duration-trend__scroller');
      const canvas = scroller?.querySelector('.reading-duration-trend__canvas');
      expect(canvas).toBeInstanceOf(HTMLElement);
      expect(canvas?.querySelector('.reading-duration-trend__axis')).toBeInstanceOf(HTMLElement);
      expect(scroller?.scrollLeft).toBe(91 * 8 - 300);
    } finally {
      restoreProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
      restoreProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth);
    }
  });

  it('provides keyboard, touch, and screen-reader access to every daily duration', async () => {
    const history = createHistory(3).map((day, index) => ({
      ...day,
      minutes: index + 1,
    }));
    const container = await renderForSmoke(
      <ReadingDurationInsights history={history} sessions={[]} />,
    );
    const plot = container.querySelector('.reading-duration-trend__plot');
    const details = container.querySelector<HTMLDetailsElement>(
      '.reading-duration-trend__details',
    );
    const dailyItems = Array.from(
      container.querySelectorAll<HTMLElement>('.reading-duration-trend__details li'),
    );

    expect(plot?.getAttribute('role')).toBe('img');
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect(details?.querySelector('summary')?.textContent).toBe('逐日明细');
    expect(dailyItems).toHaveLength(3);
    expect(dailyItems[0].querySelector('time')?.getAttribute('dateTime')).toBe(history[2].date);
    expect(dailyItems[0].textContent).toContain('3 分钟');
    expect(dailyItems[2].querySelector('time')?.getAttribute('dateTime')).toBe(history[0].date);
    expect(dailyItems[2].textContent).toContain('1 分钟');
  });

  it('normalizes sub-minute trend and source bars against their real totals', async () => {
    const history = [{
      ...createHistory(1)[0],
      minutes: 0.5,
    }];
    const startedAt = new Date(2026, 4, 28, 9, 0).getTime();
    const sessions: ReadingFocusSessionSummary[] = [{
      id: 'focus-short',
      date: history[0].date,
      startedAt,
      endedAt: startedAt + 30_000,
      effectiveMinutes: 0.5,
      effectiveWords: 110,
      pageCount: 1,
      sources: [{
        domain: 'docs.example.com',
        effectiveMinutes: 0.5,
      }],
    }];
    const container = await renderForSmoke(
      <ReadingDurationInsights history={history} sessions={sessions} />,
    );
    const trendBar = container.querySelector<HTMLElement>(
      '.reading-duration-trend__day > span',
    );
    const sourceBar = container.querySelector<HTMLElement>(
      '.reading-duration-sources__track > span',
    );

    expect(trendBar?.style.height).toBe('100%');
    expect(sourceBar?.style.width).toBe('100%');
  });

  it('renders source totals and recent focus-session details', async () => {
    const startedAt = new Date(2026, 5, 27, 9, 0).getTime();
    const sessions: ReadingFocusSessionSummary[] = [
      {
        id: 'focus-1',
        date: '2026-06-27',
        startedAt,
        endedAt: startedAt + 18 * 60_000,
        effectiveMinutes: 12,
        effectiveWords: 240,
        pageCount: 2,
        sources: [
          {
            domain: 'docs.example.com',
            effectiveMinutes: 7,
          },
          {
            domain: 'github.com',
            effectiveMinutes: 5,
          },
        ],
      },
      {
        id: 'focus-2',
        date: '2026-06-26',
        startedAt: startedAt - 24 * 60 * 60_000,
        endedAt: startedAt - 24 * 60 * 60_000 + 4 * 60_000,
        effectiveMinutes: 3,
        effectiveWords: 60,
        pageCount: 1,
        sources: [{
          domain: 'pdf.local',
          resourceType: 'pdf',
          effectiveMinutes: 3,
        }],
      },
    ];

    const container = await renderForSmoke(
      <ReadingDurationInsights history={createHistory(31)} sessions={sessions} />,
    );

    expect(container.textContent).toContain('专注会话2 次');
    expect(container.textContent).toContain('docs.example.com');
    expect(container.textContent).toContain('github.com');
    expect(container.textContent).toContain('pdf.local');
    expect(container.textContent).toContain('2 个页面 · 240 个有效词');
    expect(container.textContent).toContain('12 分钟');
  });
});

function restoreProperty(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }

  Reflect.deleteProperty(target, property);
}

function createHistory(count: number): ReadingHistoryDay[] {
  const firstDay = new Date(2026, 4, 28, 12);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    return {
      date: formatLocalDate(date),
      effectiveWords: 220,
      minutes: 1,
      newWords: 220,
      reviewWords: 0,
      checkInCompleted: false,
    };
  });
}
