import { describe, expect, it, vi } from 'vitest';

import {
  applyReadingToolbarIconState,
  applyStaticReadingToolbarIcon,
  createReadingToolbarIconState,
  getNextReadingToolbarDayRolloverAt,
  getReadingToolbarIconState,
  READING_TOOLBAR_PROGRESS_STEPS,
  syncReadingToolbarIcon,
  type ReadingToolbarAction,
  type ReadingToolbarStore,
} from './readingToolbar';

describe('reading toolbar icon state', () => {
  it('keeps an untouched day gray and exposes exact progress in the title', () => {
    const state = createReadingToolbarIconState('2026-07-11', 0, 500);

    expect(state).toMatchObject({
      effectiveWords: 0,
      thresholdWords: 500,
      completed: false,
      progressStep: 0,
      progressRatio: 0,
      badgeText: '',
      title: 'Yuel Reading · 今日 0 / 500 词',
    });
  });

  it('quantizes visible progress without appearing complete early', () => {
    const firstVisibleProgress = createReadingToolbarIconState('2026-07-11', 1, 500);
    const halfway = createReadingToolbarIconState('2026-07-11', 250, 500);
    const almostComplete = createReadingToolbarIconState('2026-07-11', 499, 500);

    expect(firstVisibleProgress.progressStep).toBe(1);
    expect(halfway.progressStep).toBe(8);
    expect(halfway.progressRatio).toBe(0.5);
    expect(almostComplete.progressStep).toBe(READING_TOOLBAR_PROGRESS_STEPS - 1);
    expect(almostComplete.completed).toBe(false);
  });

  it('uses a full green mark, gold completion state, and check badge at the goal', () => {
    const state = createReadingToolbarIconState('2026-07-11', 620, 500);

    expect(state).toMatchObject({
      completed: true,
      progressStep: READING_TOOLBAR_PROGRESS_STEPS,
      progressRatio: 1,
      badgeText: '✓',
      title: 'Yuel Reading · 今日已达标 · 620 / 500 词',
    });
  });

  it('loads only today’s effective words and active goal from local storage', async () => {
    const store = createStore(320, 900);

    const state = await getReadingToolbarIconState(
      store,
      new Date(2026, 6, 11, 9, 30).getTime(),
    );

    expect(store.dailyStats.get).toHaveBeenCalledWith('2026-07-11');
    expect(state).toMatchObject({
      date: '2026-07-11',
      effectiveWords: 320,
      thresholdWords: 900,
      completed: false,
    });
  });
});

describe('reading toolbar icon application', () => {
  it('restores the static manifest icon, title, and an empty badge', async () => {
    const action = createAction();

    await applyStaticReadingToolbarIcon(action);

    expect(action.setIcon).toHaveBeenCalledWith({
      path: {
        16: 'icon/16.png',
        24: 'icon/24.png',
        32: 'icon/32.png',
      },
    });
    expect(action.setTitle).toHaveBeenCalledWith({ title: 'Yuel Reading' });
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('renders all toolbar densities, updates the tooltip, and clears a stale badge', async () => {
    const state = createReadingToolbarIconState('2026-07-11', 250, 500);
    const action = createAction();
    const renderIcon = vi.fn((size: number) => createImageDataFixture(size));

    await applyReadingToolbarIconState(state, action, renderIcon);

    expect(renderIcon.mock.calls.map(([size]) => size)).toEqual([16, 24, 32]);
    expect(action.setIcon).toHaveBeenCalledWith({
      imageData: {
        16: expect.objectContaining({ width: 16, height: 16 }),
        24: expect.objectContaining({ width: 24, height: 24 }),
        32: expect.objectContaining({ width: 32, height: 32 }),
      },
    });
    expect(action.setTitle).toHaveBeenCalledWith({ title: state.title });
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('applies the champagne-gold completion badge after the completed icon', async () => {
    const state = createReadingToolbarIconState('2026-07-11', 500, 500);
    const action = createAction();

    await applyReadingToolbarIconState(
      state,
      action,
      (size) => createImageDataFixture(size),
    );

    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#E0AF3B' });
    expect(action.setBadgeTextColor).toHaveBeenCalledWith({ color: '#0F1F16' });
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '✓' });
  });

  it('serializes background refreshes so later storage state wins', async () => {
    const firstWrite = createDeferred<void>();
    const effectiveWords = [100, 400];
    const store = createStoreFromSequence(effectiveWords, 500);
    const action = createAction({
      setIcon: vi
        .fn<ReadingToolbarAction['setIcon']>()
        .mockImplementationOnce(() => firstWrite.promise)
        .mockResolvedValue(undefined),
    });
    const renderIcon = (size: number) => createImageDataFixture(size);

    const firstSync = syncReadingToolbarIcon({ action, store, renderIcon });
    const secondSync = syncReadingToolbarIcon({ action, store, renderIcon });

    await vi.waitFor(() => {
      expect(store.dailyStats.get).toHaveBeenCalledTimes(1);
    });
    firstWrite.resolve();
    await expect(Promise.all([firstSync, secondSync])).resolves.toEqual([
      expect.objectContaining({ effectiveWords: 100 }),
      expect.objectContaining({ effectiveWords: 400 }),
    ]);
    expect(action.setTitle).toHaveBeenLastCalledWith({
      title: 'Yuel Reading · 今日 400 / 500 词',
    });
  });

  it('skips reading-state work and keeps the static icon when progress feedback is disabled', async () => {
    const store = createStore(320, 500);
    const action = createAction();
    const renderIcon = vi.fn((size: number) => createImageDataFixture(size));

    await expect(syncReadingToolbarIcon({
      action,
      store,
      renderIcon,
      getSettings: async () => ({ progressIconEnabled: false }),
    })).resolves.toBeUndefined();

    expect(store.dailyStats.get).not.toHaveBeenCalled();
    expect(renderIcon).not.toHaveBeenCalled();
    expect(action.setIcon).toHaveBeenCalledWith({
      path: {
        16: 'icon/16.png',
        24: 'icon/24.png',
        32: 'icon/32.png',
      },
    });
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });
});

describe('reading toolbar rollover scheduling', () => {
  it('schedules one second after the next local midnight', () => {
    const now = new Date(2026, 6, 11, 23, 59, 30, 500);
    const expected = new Date(2026, 6, 12, 0, 0, 1, 0);

    expect(getNextReadingToolbarDayRolloverAt(now.getTime())).toBe(expected.getTime());
  });
});

function createStore(
  effectiveWords: number,
  thresholdWords: number,
): ReadingToolbarStore & {
  dailyStats: { get: ReturnType<typeof vi.fn> };
} {
  return {
    metadata: {
      get: vi.fn(async () => ({
        key: 'dailyCheckInThresholdWords',
        numberValue: thresholdWords,
      })),
    },
    dailyStats: {
      get: vi.fn(async (date: string) => ({
        date,
        effectiveWords,
        minutes: 1,
        streak: 0,
        topDomains: [],
      })),
    },
  };
}

function createStoreFromSequence(
  effectiveWords: number[],
  thresholdWords: number,
): ReadingToolbarStore & {
  dailyStats: { get: ReturnType<typeof vi.fn> };
} {
  let index = 0;
  return {
    metadata: {
      get: vi.fn(async () => ({
        key: 'dailyCheckInThresholdWords',
        numberValue: thresholdWords,
      })),
    },
    dailyStats: {
      get: vi.fn(async (date: string) => ({
        date,
        effectiveWords: effectiveWords[Math.min(index++, effectiveWords.length - 1)],
        minutes: 1,
        streak: 0,
        topDomains: [],
      })),
    },
  };
}

function createAction(
  overrides: Partial<ReadingToolbarAction> = {},
): ReadingToolbarAction {
  return {
    setIcon: vi.fn(async () => undefined),
    setTitle: vi.fn(async () => undefined),
    setBadgeText: vi.fn(async () => undefined),
    setBadgeBackgroundColor: vi.fn(async () => undefined),
    setBadgeTextColor: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createImageDataFixture(size: number): ImageData {
  return {
    colorSpace: 'srgb',
    data: new Uint8ClampedArray(size * size * 4),
    height: size,
    width: size,
  } as ImageData;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
