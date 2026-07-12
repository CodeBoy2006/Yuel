import { describe, expect, it } from 'vitest';

import { ReadingInsights } from '../../entrypoints/dashboard/ReadingInsights';
import type { ReadingHistoryDay } from '../storage/readingStats';
import { renderForSmoke } from './renderTest';

function createHistoryDay(date: string): ReadingHistoryDay {
  return {
    date,
    effectiveWords: 0,
    minutes: 0,
    newWords: 0,
    reviewWords: 0,
    checkInCompleted: false,
  };
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
});
