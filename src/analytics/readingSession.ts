import {
  createEventId,
  createSessionId,
  hashText,
  type PageSnapshot,
  type ReadingEvent,
  type TextChunkSnapshot,
} from '../domain/events';
import { DEFAULT_BASE_WORDS_PER_MINUTE } from '../domain/metrics';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import type { ReadingEventBatchDelivery } from '../messaging/readingEventsClient';
import type { ViewportChunkMeasurement } from './viewportGeometry';

export const READING_VISIBILITY_THRESHOLD = 0.15;
const MIN_EXPOSURE_TICK_MS = 250;

export interface ReadingChunkVisibility {
  chunkId: string;
  visible: boolean;
  visibleRatio: number;
}

export interface ReadingScrollMetrics {
  offsetPx: number;
  scrollableExtentPx: number;
}

export interface ReadingSessionOptions {
  flushIntervalMs?: number;
  idleTimeoutMs?: number;
  sampleIntervalMs?: number;
  scrollSpeedExpiryMs?: number;
}

export interface ReadingSessionConfig extends ReadingSessionOptions {
  page: PageSnapshot;
  chunks: TextChunkSnapshot[];
  deliverBatch: ReadingEventBatchDelivery;
  getChunkMeasurement: (chunkId: string) => ViewportChunkMeasurement | undefined;
  getRestorableChunkVisibilities?: () => ReadingChunkVisibility[];
  getScrollMetrics?: () => ReadingScrollMetrics;
  sessionId?: string;
}

export interface ReadingSessionController {
  readonly collecting: boolean;
  flush: () => Promise<boolean>;
  markActivity: (now?: number) => void;
  recordScroll: (now?: number) => void;
  recordSelection: (text: string, now?: number) => void;
  setChunkVisibilities: (updates: ReadingChunkVisibility[], now?: number) => void;
  stop: (options?: { emitPageHidden?: boolean }) => void;
}

interface ScrollVelocitySample {
  offsetPx: number;
  sampledAt: number;
}

type ReadingEventDetails = Omit<
  ReadingEvent,
  'id' | 'sessionId' | 'pageId' | 'kind' | 'occurredAt'
>;

export function startReadingSession(config: ReadingSessionConfig): ReadingSessionController {
  validateReadingSource(config.page, config.chunks);

  const flushIntervalMs = config.flushIntervalMs ?? 15_000;
  const idleTimeoutMs = config.idleTimeoutMs ?? 45_000;
  const sampleIntervalMs = config.sampleIntervalMs ?? 1_000;
  const scrollSpeedExpiryMs = config.scrollSpeedExpiryMs ?? 750;
  const sessionId = config.sessionId ?? createSessionId();
  const chunksById = new Map(config.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const visibleChunkIds = new Set<string>();
  const pendingEvents: ReadingEvent[] = [];
  const startedAt = Date.now();

  let latestScrollSpeedWordsPerMinute = 0;
  let latestScrollDirection: -1 | 0 | 1 = 0;
  let userIdle = false;
  let pageHidden = document.visibilityState === 'hidden';
  let windowFocused = !pageHidden && hasDocumentFocus();
  let stopped = false;
  let lastInteractionAt = startedAt;
  let lastViewportTickAt = startedAt;
  let idleStartedAt: number | undefined;
  let scrollSpeedExpiryTimer: number | undefined;
  let deliveryInFlight: Promise<boolean> | undefined;
  let lastScrollSample: ScrollVelocitySample = {
    offsetPx: readScrollMetrics(config.getScrollMetrics)?.offsetPx ?? 0,
    sampledAt: startedAt,
  };

  const emitEvent = (
    kind: ReadingEvent['kind'],
    occurredAt: number,
    details: ReadingEventDetails,
  ) => {
    pendingEvents.push({
      id: createEventId(kind, occurredAt),
      sessionId,
      pageId: config.page.pageId,
      kind,
      occurredAt,
      ...details,
    });
  };

  const closeCurrentViewportInterval = (
    now = Date.now(),
    activeTab = document.visibilityState === 'visible' && windowFocused,
    documentVisible = document.visibilityState === 'visible',
  ) => {
    appendViewportExposureTick(
      emitEvent,
      visibleChunkIds,
      chunksById,
      config.getChunkMeasurement,
      lastViewportTickAt,
      now,
      latestScrollSpeedWordsPerMinute,
      latestScrollDirection,
      activeTab,
      documentVisible,
      now - lastInteractionAt,
    );
    lastViewportTickAt = now;
  };

  const deliverPendingEvents = async (): Promise<boolean> => {
    if (pendingEvents.length === 0) {
      return true;
    }

    const events = pendingEvents.splice(0, pendingEvents.length);
    const payload: ReadingEventBatchPayload = {
      page: config.page,
      chunks: config.chunks,
      events,
    };

    let delivered = false;
    try {
      delivered = await config.deliverBatch(payload);
    } catch {
      delivered = false;
    }
    if (!delivered) {
      pendingEvents.unshift(...events);
    }
    return delivered;
  };

  const flush = (): Promise<boolean> => {
    closeCurrentViewportInterval();
    if (deliveryInFlight) {
      return deliveryInFlight.then(() => flush());
    }

    const delivery = deliverPendingEvents();
    deliveryInFlight = delivery;
    void delivery.then(() => {
      if (deliveryInFlight === delivery) {
        deliveryInFlight = undefined;
      }
    });
    return delivery;
  };

  const markUserIdle = (now: number) => {
    if (pageHidden || userIdle) {
      return;
    }

    closeCurrentViewportInterval(now);
    userIdle = true;
    idleStartedAt = now;
    emitEvent('UserIdle', now, {
      confidence: 'medium',
      value: {
        idleMs: now - lastInteractionAt,
      },
    });
  };

  let idleTimer = window.setTimeout(() => {
    markUserIdle(Date.now());
  }, idleTimeoutMs);

  const resetIdleTimer = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      markUserIdle(Date.now());
    }, idleTimeoutMs);
  };

  const markUserActive = (now: number) => {
    if (pageHidden) {
      return;
    }

    if (userIdle) {
      emitEvent('UserActive', now, {
        confidence: 'medium',
        value: {
          idleMs: idleStartedAt ? now - idleStartedAt : 0,
        },
      });
    }

    userIdle = false;
    idleStartedAt = undefined;
    lastInteractionAt = now;
    resetIdleTimer();
  };

  const markActivity = (now = Date.now()) => {
    if (pageHidden || stopped) {
      return;
    }

    closeCurrentViewportInterval(now);
    markUserActive(now);
  };

  const setChunkVisibilities = (
    updates: ReadingChunkVisibility[],
    now = Date.now(),
  ) => {
    if (pageHidden || stopped) {
      return;
    }

    const updatesByChunkId = new Map(
      updates
        .filter((update) => chunksById.has(update.chunkId))
        .map((update) => [update.chunkId, update]),
    );
    const visibleTransitions: ReadingChunkVisibility[] = [];
    const hiddenTransitions: ReadingChunkVisibility[] = [];

    for (const update of updatesByChunkId.values()) {
      const visibleRatio = clampUnitInterval(update.visibleRatio);
      const visible = update.visible && visibleRatio >= READING_VISIBILITY_THRESHOLD;
      if (visible && !visibleChunkIds.has(update.chunkId)) {
        visibleTransitions.push({ ...update, visible: true, visibleRatio });
      } else if (!visible && visibleChunkIds.has(update.chunkId)) {
        hiddenTransitions.push({
          ...update,
          visible: false,
          visibleRatio: Math.min(
            visibleRatio,
            READING_VISIBILITY_THRESHOLD - Number.EPSILON,
          ),
        });
      }
    }

    const transitions = [...visibleTransitions, ...hiddenTransitions];
    if (transitions.length === 0) {
      return;
    }

    closeCurrentViewportInterval(now);
    for (const transition of transitions) {
      const chunk = chunksById.get(transition.chunkId);
      if (!chunk) {
        continue;
      }

      const kind = transition.visible ? 'TextBlockVisible' : 'TextBlockHidden';
      if (transition.visible) {
        visibleChunkIds.add(transition.chunkId);
      } else {
        visibleChunkIds.delete(transition.chunkId);
      }
      emitEvent(kind, now, {
        chunkId: transition.chunkId,
        confidence: transition.visibleRatio > 0.65 ? 'high' : 'medium',
        value: {
          visibleRatio: transition.visibleRatio,
          wordCount: chunk.wordCount,
        },
      });
    }
  };

  const scheduleScrollSpeedExpiry = () => {
    if (scrollSpeedExpiryTimer !== undefined) {
      window.clearTimeout(scrollSpeedExpiryTimer);
    }
    scrollSpeedExpiryTimer = window.setTimeout(() => {
      scrollSpeedExpiryTimer = undefined;
      if (!pageHidden && latestScrollSpeedWordsPerMinute > 0) {
        closeCurrentViewportInterval();
      }
      latestScrollSpeedWordsPerMinute = 0;
      latestScrollDirection = 0;
    }, scrollSpeedExpiryMs);
  };

  const recordScroll = (now = Date.now()) => {
    if (pageHidden || stopped) {
      return;
    }

    const metrics = readScrollMetrics(config.getScrollMetrics);
    const measurement = metrics
      ? measureScrollVelocity(lastScrollSample, metrics, config.page.totalWords, now)
      : undefined;
    if (!measurement) {
      markUserActive(now);
      return;
    }

    closeCurrentViewportInterval(measurement.sampledAt);
    markUserActive(measurement.sampledAt);
    lastScrollSample = {
      offsetPx: measurement.offsetPx,
      sampledAt: measurement.sampledAt,
    };
    latestScrollSpeedWordsPerMinute = measurement.scrollSpeedWordsPerMinute;
    latestScrollDirection = measurement.scrollDirection;
    scheduleScrollSpeedExpiry();
    emitEvent('ScrollVelocityChanged', measurement.sampledAt, {
      confidence: confidenceFromScrollSpeed(measurement.scrollSpeedWordsPerMinute),
      value: {
        scrollDeltaPx: measurement.scrollDeltaPx,
        scrollDirection: measurement.scrollDirection,
        elapsedMs: measurement.elapsedMs,
        scrollSpeedWordsPerMinute: measurement.scrollSpeedWordsPerMinute,
      },
    });
  };

  const recordSelection = (text: string, now = Date.now()) => {
    const selectedText = text.trim();
    if (!selectedText || pageHidden || stopped) {
      return;
    }

    closeCurrentViewportInterval(now);
    markUserActive(now);
    emitEvent('TextSelected', now, {
      confidence: 'high',
      value: {
        textHash: hashText(selectedText),
        characterCount: selectedText.length,
      },
    });
  };

  const appendPageHiddenOnce = () => {
    if (pageHidden) {
      return;
    }

    const now = Date.now();
    emitEvent('PageHidden', now, { confidence: 'medium' });
    pageHidden = true;
  };

  const flushHiddenPage = () => {
    closeCurrentViewportInterval(Date.now(), windowFocused, true);
    if (scrollSpeedExpiryTimer !== undefined) {
      window.clearTimeout(scrollSpeedExpiryTimer);
      scrollSpeedExpiryTimer = undefined;
    }
    latestScrollSpeedWordsPerMinute = 0;
    latestScrollDirection = 0;
    visibleChunkIds.clear();
    appendPageHiddenOnce();
    void flush();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushHiddenPage();
      return;
    }

    if (pageHidden) {
      pageHidden = false;
      windowFocused = hasDocumentFocus();
      const now = Date.now();
      lastInteractionAt = now;
      lastViewportTickAt = now;
      resetIdleTimer();
      emitEvent('PageVisible', now, { confidence: 'medium' });
      setChunkVisibilities(readRestorableVisibilities(config.getRestorableChunkVisibilities), now);
    }
  };

  const onWindowBlur = () => {
    if (!windowFocused) {
      return;
    }

    const now = Date.now();
    closeCurrentViewportInterval(now, true, document.visibilityState === 'visible');
    windowFocused = false;
  };

  const onWindowFocus = () => {
    if (windowFocused || pageHidden) {
      return;
    }

    const now = Date.now();
    closeCurrentViewportInterval(now, false, document.visibilityState === 'visible');
    windowFocused = true;
    markUserActive(now);
  };

  const onUserActivity = () => {
    markActivity();
  };

  const flushTimer = window.setInterval(() => {
    void flush();
  }, flushIntervalMs);
  const sampleTimer = window.setInterval(() => {
    closeCurrentViewportInterval();
  }, sampleIntervalMs);

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flushHiddenPage);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
  document.addEventListener('pointerdown', onUserActivity);
  document.addEventListener('keydown', onUserActivity);

  if (!pageHidden) {
    emitEvent('PageVisible', startedAt, { confidence: 'medium' });
  }
  void flush();

  return {
    get collecting() {
      return !stopped;
    },
    flush,
    markActivity,
    recordScroll,
    recordSelection,
    setChunkVisibilities,
    stop: ({ emitPageHidden = true }: { emitPageHidden?: boolean } = {}) => {
      if (stopped) {
        return;
      }

      stopped = true;
      window.clearInterval(flushTimer);
      window.clearInterval(sampleTimer);
      window.clearTimeout(idleTimer);
      if (scrollSpeedExpiryTimer !== undefined) {
        window.clearTimeout(scrollSpeedExpiryTimer);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushHiddenPage);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('pointerdown', onUserActivity);
      document.removeEventListener('keydown', onUserActivity);
      closeCurrentViewportInterval();
      visibleChunkIds.clear();
      if (emitPageHidden) {
        appendPageHiddenOnce();
      }
      void flush().then((delivered) => {
        if (!delivered && pendingEvents.length > 0) {
          void flush();
        }
      });
    },
  };
}

function appendViewportExposureTick(
  emitEvent: (
    kind: ReadingEvent['kind'],
    occurredAt: number,
    details: ReadingEventDetails,
  ) => void,
  visibleChunkIds: Set<string>,
  chunksById: Map<string, TextChunkSnapshot>,
  getChunkMeasurement: ReadingSessionConfig['getChunkMeasurement'],
  startedAt: number,
  now: number,
  scrollSpeedWordsPerMinute: number,
  scrollDirection: -1 | 0 | 1,
  activeTab: boolean,
  documentVisible: boolean,
  idleAgeMs: number,
): void {
  const tickMs = now - startedAt;
  if (tickMs < MIN_EXPOSURE_TICK_MS || visibleChunkIds.size === 0) {
    return;
  }

  const visibleChunks = Array.from(visibleChunkIds).flatMap((chunkId) => {
    const chunk = chunksById.get(chunkId);
    const measurement = readChunkMeasurement(getChunkMeasurement, chunkId);
    if (!chunk || !measurement) {
      return [];
    }

    const visibleRatio = clampUnitInterval(measurement.visibleRatio);
    if (visibleRatio < READING_VISIBILITY_THRESHOLD) {
      return [];
    }

    const contentMultiplier = clampContentMultiplier(measurement.contentMultiplier);
    return [{
      chunkId,
      wordCount: chunk.wordCount,
      visibleRatio,
      visibleWordCount: Math.min(chunk.wordCount, chunk.wordCount * visibleRatio),
      centerDistance: Math.max(0, toFiniteNumber(measurement.centerDistance)),
      viewportY: toFiniteNumber(measurement.viewportY),
      attentionMass: Math.max(Number.EPSILON, toFiniteNumber(measurement.attentionMass)),
      contentMultiplier,
      // Kept during the v2 event migration so older background workers can
      // still validate and conservatively interpret a locally queued batch.
      contentWeight: contentMultiplier,
    }];
  });

  if (visibleChunks.length === 0) {
    return;
  }

  emitEvent('TextViewportExposureTick', now, {
    confidence: visibleChunks.some((chunk) => chunk.visibleRatio > 0.65) ? 'high' : 'medium',
    value: {
      tickMs,
      baseWordsPerMinute: DEFAULT_BASE_WORDS_PER_MINUTE,
      activeTab,
      documentVisible,
      scrollSpeedWordsPerMinute,
      scrollDirection,
      idleAgeMs: Math.max(0, idleAgeMs),
      visibleChunks,
    },
  });
}

function validateReadingSource(page: PageSnapshot, chunks: TextChunkSnapshot[]): void {
  const chunkIds = new Set<string>();
  let totalWords = 0;

  for (const chunk of chunks) {
    if (chunk.pageId !== page.pageId) {
      throw new Error(`Reading chunk ${chunk.chunkId} does not belong to page ${page.pageId}`);
    }
    if (chunkIds.has(chunk.chunkId)) {
      throw new Error(`Reading chunk id is duplicated: ${chunk.chunkId}`);
    }
    chunkIds.add(chunk.chunkId);
    totalWords += chunk.wordCount;
  }

  if (totalWords !== page.totalWords) {
    throw new Error(`Reading page word count ${page.totalWords} does not match chunk total ${totalWords}`);
  }
}

function readChunkMeasurement(
  getChunkMeasurement: ReadingSessionConfig['getChunkMeasurement'],
  chunkId: string,
): ViewportChunkMeasurement | undefined {
  try {
    return getChunkMeasurement(chunkId);
  } catch {
    return undefined;
  }
}

function readRestorableVisibilities(
  getRestorableChunkVisibilities: ReadingSessionConfig['getRestorableChunkVisibilities'],
): ReadingChunkVisibility[] {
  if (!getRestorableChunkVisibilities) {
    return [];
  }

  try {
    return getRestorableChunkVisibilities();
  } catch {
    return [];
  }
}

function readScrollMetrics(
  getScrollMetrics: ReadingSessionConfig['getScrollMetrics'],
): ReadingScrollMetrics | undefined {
  if (!getScrollMetrics) {
    return undefined;
  }

  try {
    const metrics = getScrollMetrics();
    if (
      !Number.isFinite(metrics.offsetPx) ||
      !Number.isFinite(metrics.scrollableExtentPx)
    ) {
      return undefined;
    }

    return {
      offsetPx: Math.max(0, metrics.offsetPx),
      scrollableExtentPx: Math.max(1, metrics.scrollableExtentPx),
    };
  } catch {
    return undefined;
  }
}

function measureScrollVelocity(
  previous: ScrollVelocitySample,
  current: ReadingScrollMetrics,
  totalWords: number,
  sampledAt: number,
): (ScrollVelocitySample & {
  scrollDeltaPx: number;
  scrollDirection: -1 | 1;
  elapsedMs: number;
  scrollSpeedWordsPerMinute: number;
}) | undefined {
  const elapsedMs = sampledAt - previous.sampledAt;
  const signedScrollDeltaPx = current.offsetPx - previous.offsetPx;
  const scrollDeltaPx = Math.abs(signedScrollDeltaPx);

  if (elapsedMs < 100 || scrollDeltaPx < 1) {
    return undefined;
  }

  const pageProgressPerMinute =
    (scrollDeltaPx / current.scrollableExtentPx) * (60_000 / elapsedMs);

  return {
    offsetPx: current.offsetPx,
    sampledAt,
    scrollDeltaPx,
    scrollDirection: signedScrollDeltaPx > 0 ? 1 : -1,
    elapsedMs,
    scrollSpeedWordsPerMinute: Math.round(Math.max(0, totalWords) * pageProgressPerMinute),
  };
}

function hasDocumentFocus(): boolean {
  return typeof document.hasFocus !== 'function' || document.hasFocus();
}

function confidenceFromScrollSpeed(
  scrollSpeedWordsPerMinute: number,
): ReadingEvent['confidence'] {
  if (scrollSpeedWordsPerMinute <= 400) {
    return 'high';
  }
  if (scrollSpeedWordsPerMinute <= 1_200) {
    return 'medium';
  }
  return 'low';
}

function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, toFiniteNumber(value)));
}

function clampContentMultiplier(value: number): number {
  return Math.min(1, Math.max(Number.EPSILON, toFiniteNumber(value, 1)));
}

function toFiniteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}
