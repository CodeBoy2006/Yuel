import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_READING_RECORDING_SETTINGS,
  type ReadingRecordingSettings,
} from '../storage/readingRecordingSettings';
import { startReadingRecordingControl } from './recordingControl';
import type { CollectorController } from './collector';
import type { CollectorPageContext } from './startOnce';

function createCollector(): CollectorController {
  let stopped = false;

  return {
    get collecting() {
      return !stopped;
    },
    stop: vi.fn(() => {
      stopped = true;
    }),
  };
}

describe('reading recording control', () => {
  it('starts and stops the collector as global and site settings change', async () => {
    let settings: ReadingRecordingSettings = {
      ...DEFAULT_READING_RECORDING_SETTINGS,
      recordingEnabled: false,
    };
    let notifySettingsChanged: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const collectors: CollectorController[] = [];
    const pageContext: CollectorPageContext = {};
    const control = startReadingRecordingControl({
      getSettings: async () => settings,
      getUrl: () => 'https://docs.example.com/article',
      pageContext,
      startCollector: () => {
        const collector = createCollector();
        collectors.push(collector);
        return collector;
      },
      subscribeToSettings: (refresh) => {
        notifySettingsChanged = refresh;
        return unsubscribe;
      },
    });

    await control.refresh();
    expect(control.collecting).toBe(false);
    expect(collectors).toHaveLength(0);

    settings = DEFAULT_READING_RECORDING_SETTINGS;
    notifySettingsChanged?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(control.collecting).toBe(true);
    expect(collectors).toHaveLength(1);

    settings = {
      recordingEnabled: true,
      excludedSiteDomains: ['docs.example.com'],
    };
    await control.refresh();
    expect(control.collecting).toBe(false);
    expect(collectors[0]?.stop).toHaveBeenCalledOnce();

    control.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('fails closed when recording settings cannot be read', async () => {
    let shouldFail = false;
    const collector = createCollector();
    const control = startReadingRecordingControl({
      getSettings: async () => {
        if (shouldFail) throw new Error('storage unavailable');
        return DEFAULT_READING_RECORDING_SETTINGS;
      },
      getUrl: () => 'https://example.com/article',
      pageContext: {},
      startCollector: () => collector,
      subscribeToSettings: () => () => undefined,
    });

    await control.refresh();
    expect(control.collecting).toBe(true);

    shouldFail = true;
    await expect(control.refresh()).rejects.toThrow('storage unavailable');
    expect(control.collecting).toBe(false);
    expect(collector.stop).toHaveBeenCalledOnce();
  });
});
