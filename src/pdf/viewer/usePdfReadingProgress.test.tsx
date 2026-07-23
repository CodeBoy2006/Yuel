import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TodayReadingSummary } from '../../storage/readingStats';
import { BrandLockup } from '../../ui/primitives';
import { renderForSmoke } from '../../ui/renderTest';
import { usePdfBrandProgress } from './usePdfReadingProgress';

const liveQueryObservers = vi.hoisted(() => [] as Array<{
  error: (error: unknown) => void;
  next: (value: unknown) => void;
}>);

vi.mock('dexie', async (importOriginal) => {
  const original = await importOriginal<typeof import('dexie')>();

  return {
    ...original,
    liveQuery: vi.fn(() => ({
      subscribe: (observer: typeof liveQueryObservers[number]) => {
        liveQueryObservers.push(observer);
        return { unsubscribe: vi.fn() };
      },
    })),
  };
});

function PdfBrand() {
  return <BrandLockup compact {...usePdfBrandProgress()} />;
}

describe('PDF reader brand progress', () => {
  it('updates the shared logo as daily reading reaches the goal', async () => {
    const summary = {
      date: '2026-07-23',
      effectiveWords: 250,
      minutes: 3,
      streak: 0,
      checkInThresholdWords: 500,
      checkInCompleted: false,
      topDomains: [],
      readPages: 1,
      learningWords: 0,
      hasData: true,
    } satisfies TodayReadingSummary;
    const container = await renderForSmoke(<PdfBrand />);
    const mark = container.querySelector<HTMLElement>('.yuel-brand__mark');

    expect(liveQueryObservers).toHaveLength(1);
    expect(mark?.dataset.state).toBe('loading');

    await act(async () => liveQueryObservers[0].next(summary));
    expect(mark?.dataset.state).toBe('progress');
    expect(mark?.style.getPropertyValue('--y-brand-progress')).toBe('50%');

    await act(async () => liveQueryObservers[0].next({
      ...summary,
      effectiveWords: 500,
      checkInCompleted: true,
    }));
    expect(mark?.dataset.state).toBe('complete');
    expect(mark?.style.getPropertyValue('--y-brand-progress')).toBe('100%');
  });
});
