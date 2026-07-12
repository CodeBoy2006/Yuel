import { browser } from 'wxt/browser';

import {
  hasCompletedDailyCheckIn,
  normalizeDailyCheckInThresholdWords,
} from '../domain/checkIn';
import { formatLocalDate } from '../domain/localDate';
import { getDailyCheckInThresholdWords } from '../storage/checkInSettings';
import {
  getReadingToolbarSettings,
  type ReadingToolbarSettings,
} from '../storage/readingToolbarSettings';
import {
  db,
  type DailyStatRecord,
  type MetadataRecord,
} from '../storage/schema';
import { formatCount } from '../ui/formatters';

export const READING_TOOLBAR_DAY_ROLLOVER_ALARM = 'yuel.readingToolbar.dayRollover';
export const READING_TOOLBAR_PROGRESS_STEPS = 16;
export const READING_TOOLBAR_ICON_SIZES = [16, 24, 32] as const;

const READING_TOOLBAR_DEFAULT_TITLE = 'Yuel Reading';
const READING_TOOLBAR_STATIC_ICON_PATHS: Record<string, string> = Object.fromEntries(
  READING_TOOLBAR_ICON_SIZES.map((size) => [String(size), `icon/${size}.png`]),
);
const LOGO_VIEWBOX_X = 177;
const LOGO_VIEWBOX_Y = 177;
const LOGO_VIEWBOX_SIZE = 900;
const LOGO_MARK_TOP = 227;
const LOGO_MARK_BOTTOM = 1028;
const TOOLBAR_ICON_INACTIVE = '#7D8A82';
const TOOLBAR_ICON_GREEN = '#077045';
const TOOLBAR_ICON_GOLD = '#E0AF3B';
const TOOLBAR_ICON_GOLD_SOFT = '#F7E3B0';
const TOOLBAR_BADGE_TEXT = '#0F1F16';
const TOOLBAR_ICON_COMPLETED_SCALE = 0.9;
const TOOLBAR_ICON_GLOW_LAYERS = [
  { alpha: 0.2, lineWidth: 120, shadowBlurRatio: 0.28 },
  { alpha: 0.44, lineWidth: 84, shadowBlurRatio: 0.16 },
  { alpha: 0.76, lineWidth: 56, shadowBlurRatio: 0.08 },
] as const;

// Toolbar icons must be raster ImageData, so the canonical logo geometry is
// retained here for deterministic service-worker rendering without DOM access.
const LOGO_PATH_DATA = [
  'M273.5 230L483 303.5C506 311.5 530.5 327 552 349C572.5 370 590 395 599.5 419.5L509 596C466 580.5 426.5 568 397.5 554C363.5 537.5 339 508.5 328 471.5L263.5 239.5C260.8 231.2 265 227.2 273.5 230Z',
  'M980 230C988.5 227.8 993.8 232.8 991 241.8L925 470C916.2 501 899 527.2 875.5 546C853 564 827 574.8 798 585L714 614.8C643 640 584.5 692 531.5 770C528.5 709.5 534.5 666.5 548 626C559.5 591.5 577.8 555 596 519.5L642.5 435.5C672 381.5 706.5 328 768.5 304L980 230Z',
  'M724 655L724 873.5C724 908.5 704.2 941 670 961.5L546 1022.5C536 1027 530 1020.8 530 1009.5L530 929C530 854.5 562.5 778.5 618 728C651 698 684 674 715.5 657C720 654.5 723 653.8 724 655Z',
] as const;

export interface ReadingToolbarStore {
  metadata: {
    get: (key: string) => Promise<MetadataRecord | undefined>;
  };
  dailyStats: {
    get: (date: string) => Promise<DailyStatRecord | undefined>;
  };
}

export interface ReadingToolbarIconState {
  date: string;
  effectiveWords: number;
  thresholdWords: number;
  completed: boolean;
  progressStep: number;
  progressRatio: number;
  title: string;
  badgeText: '' | '✓';
}

export interface ReadingToolbarAction {
  setIcon: (details:
    | { imageData: Record<string, ImageData> }
    | { path: Record<string, string> }
  ) => Promise<void>;
  setTitle: (details: { title: string }) => Promise<void>;
  setBadgeText: (details: { text: string }) => Promise<void>;
  setBadgeBackgroundColor: (details: { color: string }) => Promise<void>;
  setBadgeTextColor?: (details: { color: string }) => Promise<void>;
}

export interface ReadingToolbarSyncDependencies {
  action?: ReadingToolbarAction;
  store?: ReadingToolbarStore;
  now?: number;
  renderIcon?: typeof renderReadingToolbarIcon;
  getSettings?: () => Promise<ReadingToolbarSettings>;
}

const renderedIconCache = new Map<string, ImageData>();
let logoPaths: Path2D[] | undefined;
let syncQueue: Promise<void> = Promise.resolve();

export function createReadingToolbarIconState(
  date: string,
  effectiveWords: number,
  thresholdWords: number,
): ReadingToolbarIconState {
  const normalizedEffectiveWords = Number.isFinite(effectiveWords)
    ? Math.max(0, effectiveWords)
    : 0;
  const normalizedThresholdWords = normalizeDailyCheckInThresholdWords(thresholdWords);
  const completed = hasCompletedDailyCheckIn(
    { effectiveWords: normalizedEffectiveWords },
    normalizedThresholdWords,
  );
  const exactProgress = Math.min(1, normalizedEffectiveWords / normalizedThresholdWords);
  const progressStep = completed
    ? READING_TOOLBAR_PROGRESS_STEPS
    : normalizedEffectiveWords === 0
      ? 0
      : Math.min(
          READING_TOOLBAR_PROGRESS_STEPS - 1,
          Math.max(1, Math.round(exactProgress * READING_TOOLBAR_PROGRESS_STEPS)),
        );
  const progressRatio = progressStep / READING_TOOLBAR_PROGRESS_STEPS;
  const progressText = `${formatCount(normalizedEffectiveWords)} / ${formatCount(normalizedThresholdWords)} 词`;

  return {
    date,
    effectiveWords: normalizedEffectiveWords,
    thresholdWords: normalizedThresholdWords,
    completed,
    progressStep,
    progressRatio,
    title: completed
      ? `Yuel Reading · 今日已达标 · ${progressText}`
      : `Yuel Reading · 今日 ${progressText}`,
    badgeText: completed ? '✓' : '',
  };
}

export async function getReadingToolbarIconState(
  store: ReadingToolbarStore = db,
  now = Date.now(),
): Promise<ReadingToolbarIconState> {
  const date = formatLocalDate(now);
  const [dailyStat, thresholdWords] = await Promise.all([
    store.dailyStats.get(date),
    getDailyCheckInThresholdWords(store),
  ]);

  return createReadingToolbarIconState(
    date,
    dailyStat?.effectiveWords ?? 0,
    thresholdWords,
  );
}

export function renderReadingToolbarIcon(
  size: number,
  state: Pick<ReadingToolbarIconState, 'completed' | 'progressStep'>,
): ImageData {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('Toolbar icon size must be a positive integer.');
  }

  const cacheKey = `${size}:${state.progressStep}:${state.completed ? 'complete' : 'progress'}`;
  const cached = renderedIconCache.get(cacheKey);
  if (cached) return cached;

  if (typeof OffscreenCanvas === 'undefined' || typeof Path2D === 'undefined') {
    throw new Error('Toolbar icon rendering requires OffscreenCanvas and Path2D.');
  }

  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Unable to create the toolbar icon canvas context.');
  }

  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.save();
  context.scale(size / LOGO_VIEWBOX_SIZE, size / LOGO_VIEWBOX_SIZE);
  context.translate(-LOGO_VIEWBOX_X, -LOGO_VIEWBOX_Y);

  const paths = getLogoPaths();
  if (state.completed) {
    const logoCenter = LOGO_VIEWBOX_X + LOGO_VIEWBOX_SIZE / 2;
    context.translate(logoCenter, logoCenter);
    context.scale(TOOLBAR_ICON_COMPLETED_SCALE, TOOLBAR_ICON_COMPLETED_SCALE);
    context.translate(-logoCenter, -logoCenter);
  }

  const renderedProgressRatio = state.completed
    ? 1
    : Math.min(
        READING_TOOLBAR_PROGRESS_STEPS - 1,
        Math.max(0, state.progressStep),
      ) / READING_TOOLBAR_PROGRESS_STEPS;
  if (state.completed) {
    // Layered strokes create a readable falloff at toolbar sizes. The mark is
    // slightly inset above so the wider halo remains visible inside the bitmap.
    for (const layer of TOOLBAR_ICON_GLOW_LAYERS) {
      context.save();
      context.globalAlpha = layer.alpha;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = layer.lineWidth;
      context.strokeStyle = TOOLBAR_ICON_GOLD_SOFT;
      context.shadowColor = TOOLBAR_ICON_GOLD_SOFT;
      context.shadowBlur = size * layer.shadowBlurRatio;
      strokeLogoPaths(context, paths);
      context.restore();
    }
  }

  context.fillStyle = TOOLBAR_ICON_INACTIVE;
  fillLogoPaths(context, paths);

  if (renderedProgressRatio > 0) {
    const fillTop = LOGO_MARK_BOTTOM
      - (LOGO_MARK_BOTTOM - LOGO_MARK_TOP) * renderedProgressRatio;

    context.save();
    context.beginPath();
    context.rect(
      LOGO_VIEWBOX_X,
      fillTop,
      LOGO_VIEWBOX_SIZE,
      LOGO_MARK_BOTTOM - fillTop + 1,
    );
    context.clip();
    context.fillStyle = TOOLBAR_ICON_GREEN;
    fillLogoPaths(context, paths);
    context.restore();
  }

  if (!state.completed && renderedProgressRatio > 0) {
    // A fine inactive outline preserves the logo silhouette on both light and
    // dark Chrome themes while the forest-green interior carries progress.
    context.save();
    context.globalAlpha = 0.9;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 18;
    context.strokeStyle = TOOLBAR_ICON_INACTIVE;
    strokeLogoPaths(context, paths);
    context.restore();
  }

  if (state.completed) {
    context.save();
    context.globalAlpha = 0.98;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 28;
    context.strokeStyle = TOOLBAR_ICON_GOLD;
    context.shadowColor = TOOLBAR_ICON_GOLD;
    context.shadowBlur = size / 10;
    strokeLogoPaths(context, paths);
    context.restore();
  }

  context.restore();
  const imageData = context.getImageData(0, 0, size, size);
  renderedIconCache.set(cacheKey, imageData);
  return imageData;
}

export async function applyReadingToolbarIconState(
  state: ReadingToolbarIconState,
  action: ReadingToolbarAction = getDefaultToolbarAction(),
  renderIcon: typeof renderReadingToolbarIcon = renderReadingToolbarIcon,
): Promise<void> {
  const imageData = Object.fromEntries(
    READING_TOOLBAR_ICON_SIZES.map((size) => [
      String(size),
      renderIcon(size, state),
    ]),
  ) as Record<string, ImageData>;

  await Promise.all([
    action.setIcon({ imageData }),
    action.setTitle({ title: state.title }),
  ]);

  if (!state.completed) {
    await action.setBadgeText({ text: '' });
    return;
  }

  await Promise.all([
    action.setBadgeBackgroundColor({ color: TOOLBAR_ICON_GOLD }),
    action.setBadgeTextColor?.({ color: TOOLBAR_BADGE_TEXT }) ?? Promise.resolve(),
  ]);
  await action.setBadgeText({ text: state.badgeText });
}

export async function applyStaticReadingToolbarIcon(
  action: ReadingToolbarAction = getDefaultToolbarAction(),
): Promise<void> {
  await Promise.all([
    action.setIcon({ path: READING_TOOLBAR_STATIC_ICON_PATHS }),
    action.setTitle({ title: READING_TOOLBAR_DEFAULT_TITLE }),
  ]);
  await action.setBadgeText({ text: '' });
}

export function syncReadingToolbarIcon(
  dependencies: ReadingToolbarSyncDependencies = {},
): Promise<ReadingToolbarIconState | undefined> {
  const pending = syncQueue.then(async () => {
    const settings = await (
      dependencies.getSettings
      ?? getReadingToolbarSettings
    )();
    if (!settings.progressIconEnabled) {
      await applyStaticReadingToolbarIcon(
        dependencies.action ?? getDefaultToolbarAction(),
      );
      return undefined;
    }

    const state = await getReadingToolbarIconState(
      dependencies.store ?? db,
      dependencies.now ?? Date.now(),
    );
    await applyReadingToolbarIconState(
      state,
      dependencies.action ?? getDefaultToolbarAction(),
      dependencies.renderIcon ?? renderReadingToolbarIcon,
    );
    return state;
  });

  syncQueue = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

export function getNextReadingToolbarDayRolloverAt(now = Date.now()): number {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 1, 0);
  return nextDay.getTime();
}

function getDefaultToolbarAction(): ReadingToolbarAction {
  return browser.action as unknown as ReadingToolbarAction;
}

function getLogoPaths(): Path2D[] {
  logoPaths ??= LOGO_PATH_DATA.map((pathData) => new Path2D(pathData));
  return logoPaths;
}

function fillLogoPaths(
  context: OffscreenCanvasRenderingContext2D,
  paths: Path2D[],
): void {
  for (const path of paths) {
    context.fill(path);
  }
}

function strokeLogoPaths(
  context: OffscreenCanvasRenderingContext2D,
  paths: Path2D[],
): void {
  for (const path of paths) {
    context.stroke(path);
  }
}
