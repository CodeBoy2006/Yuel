import { describe, expect, it } from 'vitest';

import { formatLocalDate, shiftLocalDate } from './localDate';

describe('local calendar dates', () => {
  it('formats Date objects and timestamps with the local calendar day', () => {
    const date = new Date(2026, 5, 7, 10, 30);

    expect(formatLocalDate(date)).toBe('2026-06-07');
    expect(formatLocalDate(date.getTime())).toBe('2026-06-07');
  });

  it('shifts across month and year boundaries', () => {
    expect(shiftLocalDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftLocalDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
