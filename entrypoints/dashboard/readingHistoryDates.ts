import type { ReadingHistoryDay } from '../../src/storage/readingStats';

export const monthDayFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
});
export const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

export function formatPeriodLabel(history: ReadingHistoryDay[]): string {
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last) return '近 13 周';
  return `${monthDayFormatter.format(parseLocalDate(first.date))}–${monthDayFormatter.format(parseLocalDate(last.date))}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  // Noon keeps chart calendar stepping stable across daylight-saving transitions.
  return new Date(year, month - 1, day, 12);
}
