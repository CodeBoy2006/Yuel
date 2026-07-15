import { describe, expect, it } from 'vitest';

import { ReadingInsights } from '../../entrypoints/dashboard/ReadingInsights';
import type { ReadingHistoryDay } from '../storage/readingStats';
import { renderForSmoke } from './renderTest';

function createHistoryDay(date: string, effectiveWords = 0): ReadingHistoryDay {
  return {
    date,
    effectiveWords,
    minutes: 0,
    newWords: effectiveWords,
    reviewWords: 0,
    checkInCompleted: false,
  };
}

function getHeatLevel(container: HTMLElement, date: string): string | null | undefined {
  return container.querySelector(`[data-date="${date}"]`)?.getAttribute('data-level');
}

describe('ReadingInsights heatmap', () => {
  it('labels each calendar month once when month starts span adjacent weeks', async () => {
    const container = await renderForSmoke(
      <ReadingInsights dailyGoal={500} history={[createHistoryDay('2026-07-12')]} />,
    );

    const monthLabels = Array.from(container.querySelectorAll('.reading-heatmap__month'))
      .map((label) => label.textContent)
      .filter(Boolean);

    expect(monthLabels).toEqual(['4月', '5月', '6月', '7月']);
  });

  it('adapts four color levels to the visible reading range instead of the daily goal', async () => {
    const history = [
      createHistoryDay('2026-07-08', 100),
      createHistoryDay('2026-07-09', 260),
      createHistoryDay('2026-07-10', 510),
      createHistoryDay('2026-07-11', 760),
      createHistoryDay('2026-07-12', 1_000),
    ];
    const lowGoalContainer = await renderForSmoke(
      <ReadingInsights dailyGoal={100} history={history} />,
    );
    const highGoalContainer = await renderForSmoke(
      <ReadingInsights dailyGoal={10_000} history={history} />,
    );
    const expectedLevels = ['1', '2', '3', '4', '4'];

    history.forEach((day, index) => {
      expect(getHeatLevel(lowGoalContainer, day.date)).toBe(expectedLevels[index]);
      expect(getHeatLevel(highGoalContainer, day.date)).toBe(expectedLevels[index]);
    });
    expect(lowGoalContainer.textContent).toContain('自适应分级');
    expect(lowGoalContainer.textContent).not.toContain('达标及以上');
  });

  it('keeps ordinary active days distinguishable when one day is an extreme outlier', async () => {
    const history = Array.from({ length: 20 }, (_, index) => {
      const date = new Date(2026, 5, 23 + index, 12);
      const dateKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-');
      return createHistoryDay(dateKey, index === 19 ? 1_000 : index + 1);
    });
    const container = await renderForSmoke(
      <ReadingInsights dailyGoal={500} history={history} />,
    );

    expect(getHeatLevel(container, history[4]?.date ?? '')).toBe('2');
    expect(getHeatLevel(container, history[9]?.date ?? '')).toBe('3');
    expect(getHeatLevel(container, history[18]?.date ?? '')).toBe('4');
    expect(getHeatLevel(container, history[19]?.date ?? '')).toBe('4');
  });
});
