import { describe, expect, it, vi } from 'vitest';

import type { DailyStatRecord, MetadataRecord } from './schema';
import {
  DAILY_CHECK_IN_THRESHOLD_WORDS_KEY,
  getDailyCheckInThresholdWords,
  recalculateDailyCheckInStreaks,
  saveDailyCheckInThresholdWords,
  type DailyCheckInSettingsWriteStore,
} from './checkInSettings';

describe('daily check-in settings', () => {
  it('uses the product default when no threshold has been stored', async () => {
    const thresholdWords = await getDailyCheckInThresholdWords({
      metadata: { get: vi.fn(async () => undefined) },
    });

    expect(thresholdWords).toBe(500);
  });

  it('saves the threshold and recalculates historical streaks atomically', async () => {
    const records = [
      createDailyStat('2026-06-24', 700),
      createDailyStat('2026-06-25', 300),
      createDailyStat('2026-06-26', 800),
      createDailyStat('2026-06-27', 900),
    ];
    const metadataRecords = new Map<string, MetadataRecord>();
    const bulkPut = vi.fn(async (nextRecords: DailyStatRecord[]) => {
      records.splice(0, records.length, ...nextRecords);
    });
    const transaction = vi.fn(async (
      _mode: 'rw',
      _tables: unknown[],
      operation: () => Promise<void>,
    ) => operation());
    const store: DailyCheckInSettingsWriteStore = {
      metadata: {
        get: async (key) => metadataRecords.get(key),
        put: async (record) => {
          metadataRecords.set(record.key, record);
        },
      },
      dailyStats: {
        orderBy: () => ({ toArray: async () => records }),
        bulkPut,
      },
      transaction,
    };

    await saveDailyCheckInThresholdWords(500, store);

    expect(transaction).toHaveBeenCalledOnce();
    expect(metadataRecords.get(DAILY_CHECK_IN_THRESHOLD_WORDS_KEY)?.numberValue).toBe(500);
    expect(records.map(({ date, checkInThresholdWords, streak }) => ({ date, checkInThresholdWords, streak }))).toEqual([
      { date: '2026-06-24', checkInThresholdWords: 500, streak: 1 },
      { date: '2026-06-25', checkInThresholdWords: 500, streak: 0 },
      { date: '2026-06-26', checkInThresholdWords: 500, streak: 1 },
      { date: '2026-06-27', checkInThresholdWords: 500, streak: 2 },
    ]);
  });

  it('starts a new streak after a calendar gap', () => {
    const recalculated = recalculateDailyCheckInStreaks([
      createDailyStat('2026-06-24', 700),
      createDailyStat('2026-06-26', 800),
    ], 500);

    expect(recalculated.map((record) => record.streak)).toEqual([1, 1]);
  });

  it('rejects invalid thresholds without writing settings or history', async () => {
    const store: DailyCheckInSettingsWriteStore = {
      metadata: {
        get: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
      dailyStats: {
        orderBy: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
        bulkPut: vi.fn(async () => undefined),
      },
    };

    await expect(saveDailyCheckInThresholdWords(0, store)).rejects.toBeInstanceOf(RangeError);
    expect(store.metadata.put).not.toHaveBeenCalled();
    expect(store.dailyStats.orderBy).not.toHaveBeenCalled();
  });
});

function createDailyStat(date: string, effectiveWords: number): DailyStatRecord {
  return {
    date,
    effectiveWords,
    minutes: effectiveWords / 200,
    advancedWords: 0,
    expressions: 0,
    streak: 99,
    topDomains: [],
  };
}
