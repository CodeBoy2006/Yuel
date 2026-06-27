import { browser } from 'wxt/browser';

import { isReadingEventBatchMessage } from '../src/messaging/contracts';
import { recordReadingEventBatch } from '../src/storage/repositories';

export default defineBackground({
  type: 'module',
  main() {
    browser.runtime.onInstalled.addListener(() => {
      void browser.alarms.create('yuel.rollup.hourly', { periodInMinutes: 60 });
      void enableSidePanelOnActionClick();
    });

    browser.runtime.onMessage.addListener((message) => {
      if (!isReadingEventBatchMessage(message)) {
        return undefined;
      }

      void recordReadingEventBatch(message.payload).catch((error) => {
        console.error('Failed to record Yuel reading batch', error);
      });

      return undefined;
    });
  },
});

async function enableSidePanelOnActionClick(): Promise<void> {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: {
      sidePanel?: {
        setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void>;
      };
    };
  }).chrome;

  if (chromeApi?.sidePanel?.setPanelBehavior) {
    await chromeApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}
