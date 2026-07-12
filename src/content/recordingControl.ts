import { browser } from 'wxt/browser';

import {
  getReadingRecordingSettings,
  isReadingRecordingEnabledForUrl,
  READING_RECORDING_SETTINGS_KEY,
  type ReadingRecordingSettings,
} from '../storage/readingRecordingSettings';
import { startReadingCollector, type CollectorController } from './collector';
import {
  startReadingCollectorOnce,
  stopReadingCollectorOnce,
  type CollectorPageContext,
} from './startOnce';

export interface ReadingRecordingController {
  readonly collecting: boolean;
  refresh: () => Promise<void>;
  stop: () => void;
}

export interface ReadingRecordingControlOptions {
  getSettings?: () => Promise<ReadingRecordingSettings>;
  getUrl?: () => string;
  pageContext?: CollectorPageContext;
  startCollector?: () => CollectorController;
  subscribeToSettings?: (refresh: () => void) => () => void;
}

export function startReadingRecordingControl({
  getSettings = getReadingRecordingSettings,
  getUrl = () => window.location.href,
  pageContext = globalThis as CollectorPageContext,
  startCollector = startReadingCollector,
  subscribeToSettings = subscribeToReadingRecordingSettings,
}: ReadingRecordingControlOptions = {}): ReadingRecordingController {
  let activeCollector: CollectorController | undefined;
  let stopped = false;
  let refreshSequence = 0;

  const stopCollector = () => {
    stopReadingCollectorOnce(pageContext);
    activeCollector = undefined;
  };

  const refresh = async () => {
    const requestId = ++refreshSequence;

    try {
      const settings = await getSettings();
      if (stopped || requestId !== refreshSequence) return;

      if (isReadingRecordingEnabledForUrl(settings, getUrl())) {
        activeCollector = startReadingCollectorOnce(pageContext, startCollector);
      } else {
        stopCollector();
      }
    } catch (error) {
      if (!stopped && requestId === refreshSequence) {
        stopCollector();
      }
      throw error;
    }
  };

  const unsubscribe = subscribeToSettings(() => {
    void refresh().catch((error) => {
      console.error('Failed to apply Yuel reading recording settings', error);
    });
  });

  void refresh().catch((error) => {
    console.error('Failed to load Yuel reading recording settings', error);
  });

  return {
    get collecting() {
      return activeCollector?.collecting === true;
    },
    refresh,
    stop: () => {
      if (stopped) return;
      stopped = true;
      refreshSequence += 1;
      unsubscribe();
      stopCollector();
    },
  };
}

function subscribeToReadingRecordingSettings(refresh: () => void): () => void {
  const handleStorageChange = (
    changes: Record<string, unknown>,
    areaName: string,
  ) => {
    if (areaName === 'local' && READING_RECORDING_SETTINGS_KEY in changes) {
      refresh();
    }
  };

  browser.storage.onChanged.addListener(handleStorageChange);
  return () => browser.storage.onChanged.removeListener(handleStorageChange);
}
