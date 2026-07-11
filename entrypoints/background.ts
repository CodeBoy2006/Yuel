import { browser } from 'wxt/browser';

import { handleMaintenanceAlarm, YUEL_MAINTENANCE_ALARM } from '../src/background/maintenance';
import { respondToReadingRuntimeMessage } from '../src/background/readingMessage';
import {
  getNextReadingToolbarDayRolloverAt,
  READING_TOOLBAR_DAY_ROLLOVER_ALARM,
  syncReadingToolbarIcon,
} from '../src/background/readingToolbar';
import { respondToReadingToolbarRuntimeMessage } from '../src/background/readingToolbarMessage';
import { registerSaveSelectionClickHandler, registerSaveSelectionContextMenu } from '../src/background/saveSelectionMenu';
import { removeLegacySiteAccessState } from '../src/permissions/legacySiteAccess';

export default defineBackground({
  type: 'module',
  main() {
    registerSaveSelectionClickHandler();
    initializeReadingToolbar();

    browser.runtime.onInstalled.addListener(() => {
      void browser.alarms.create(YUEL_MAINTENANCE_ALARM, { periodInMinutes: 60 });
      void enableSidePanelOnActionClick();
      void setupSaveSelectionContextMenu();
      void cleanupLegacySiteAccess();
    });

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === READING_TOOLBAR_DAY_ROLLOVER_ALARM) {
        void runReadingToolbarDayRollover();
        return;
      }
      void runMaintenanceAlarm(alarm);
    });

    browser.runtime.onStartup.addListener(() => {
      void setupSaveSelectionContextMenu();
      void cleanupLegacySiteAccess();
    });

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const readingResponse = respondToReadingRuntimeMessage(message, sender, sendResponse);
      return readingResponse
        ?? respondToReadingToolbarRuntimeMessage(message, sendResponse);
    });
  },
});

function initializeReadingToolbar(): void {
  void refreshReadingToolbarIcon();
  void scheduleNextReadingToolbarDayRollover();
}

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

async function cleanupLegacySiteAccess(): Promise<void> {
  try {
    await removeLegacySiteAccessState();
  } catch (error) {
    console.error('Failed to remove legacy Yuel site-access state', error);
  }
}

async function setupSaveSelectionContextMenu(): Promise<void> {
  try {
    await registerSaveSelectionContextMenu();
  } catch (error) {
    console.error('Failed to register Yuel save-selection context menu', error);
  }
}

async function runMaintenanceAlarm(alarm: { name: string }): Promise<void> {
  try {
    await handleMaintenanceAlarm(alarm);
  } catch (error) {
    console.error('Failed to run Yuel maintenance alarm', error);
  }
}

async function runReadingToolbarDayRollover(): Promise<void> {
  await refreshReadingToolbarIcon();
  await scheduleNextReadingToolbarDayRollover();
}

async function refreshReadingToolbarIcon(): Promise<void> {
  try {
    await syncReadingToolbarIcon();
  } catch (error) {
    console.error('Failed to refresh Yuel reading toolbar icon', error);
  }
}

async function scheduleNextReadingToolbarDayRollover(): Promise<void> {
  try {
    await browser.alarms.create(READING_TOOLBAR_DAY_ROLLOVER_ALARM, {
      when: getNextReadingToolbarDayRolloverAt(),
    });
  } catch (error) {
    console.error('Failed to schedule Yuel reading toolbar rollover', error);
  }
}
