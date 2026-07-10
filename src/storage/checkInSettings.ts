import {
  hasCompletedDailyCheckIn,
  isValidDailyCheckInThresholdWords,
  normalizeDailyCheckInThresholdWords,
} from '../domain/checkIn';
import {
  db,
  type DailyStatRecord,
  type MetadataRecord,
} from './schema';

export const DAILY_CHECK_IN_THRESHOLD_WORDS_KEY = 'dailyCheckInThresholdWords';

export interface DailyCheckInSettingsReadStore {
  metadata?: {
    get: (key: string) => Promise<MetadataRecord | undefined>;
  };
}

export interface DailyCheckInSettingsWriteStore extends DailyCheckInSettingsReadStore {
  metadata: {
    get: (key: string) => Promise<MetadataRecord | undefined>;
    put: (record: MetadataRecord) => Promise<unknown>;
  };
  dailyStats: {
    orderBy: (index: string) => {
      toArray: () => Promise<DailyStatRecord[]>;
    };
    bulkPut: (records: DailyStatRecord[]) => Promise<unknown>;
  };
  transaction?: (
    mode: 'rw',
    tables: unknown[],
    operation: () => Promise<void>,
  ) => Promise<unknown>;
}

export async function getDailyCheckInThresholdWords(
  store: DailyCheckInSettingsReadStore = db,
): Promise<number> {
  const stored = await store.metadata?.get(DAILY_CHECK_IN_THRESHOLD_WORDS_KEY);
  return normalizeDailyCheckInThresholdWords(stored?.numberValue);
}

export async function saveDailyCheckInThresholdWords(
  thresholdWords: number,
  store: DailyCheckInSettingsWriteStore = db as unknown as DailyCheckInSettingsWriteStore,
): Promise<number> {
  if (!isValidDailyCheckInThresholdWords(thresholdWords)) {
    throw new RangeError('Daily check-in threshold must be a supported whole-word value.');
  }

  const persistSettingAndRecalculateHistory = async () => {
    const records = await store.dailyStats.orderBy('date').toArray();
    const recalculatedRecords = recalculateDailyCheckInStreaks(records, thresholdWords);

    if (recalculatedRecords.length > 0) {
      await store.dailyStats.bulkPut(recalculatedRecords);
    }
    await store.metadata.put({
      key: DAILY_CHECK_IN_THRESHOLD_WORDS_KEY,
      numberValue: thresholdWords,
    });
  };

  if (store.transaction) {
    await store.transaction('rw', [store.dailyStats, store.metadata], persistSettingAndRecalculateHistory);
  } else {
    await persistSettingAndRecalculateHistory();
  }

  return thresholdWords;
}

export function recalculateDailyCheckInStreaks(
  records: DailyStatRecord[],
  thresholdWords: number,
): DailyStatRecord[] {
  const sortedRecords = [...records].sort((left, right) => left.date.localeCompare(right.date));
  let previousDate: string | undefined;
  let previousStreak = 0;

  return sortedRecords.map((record) => {
    const completed = hasCompletedDailyCheckIn(record, thresholdWords);
    const followsPreviousDate = previousDate !== undefined && previousLocalDate(record.date) === previousDate;
    const streak = completed
      ? followsPreviousDate
        ? previousStreak + 1
        : 1
      : 0;

    previousDate = record.date;
    previousStreak = streak;

    return {
      ...record,
      checkInThresholdWords: thresholdWords,
      streak,
    };
  });
}

function previousLocalDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(year, month - 1, day);
  previous.setDate(previous.getDate() - 1);
  return formatLocalDate(previous);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
