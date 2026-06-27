import { browser } from 'wxt/browser';

import { handleMaintenanceAlarm, YUEL_MAINTENANCE_ALARM } from '../src/background/maintenance';
import { handleReadingRuntimeMessage } from '../src/background/readingMessage';
import { registerSaveSelectionClickHandler, registerSaveSelectionContextMenu } from '../src/background/saveSelectionMenu';
import { registerEnabledSiteContentScripts } from '../src/permissions/contentScriptRegistration';
import { handleHostPermissionsRemoved } from '../src/permissions/siteAccess';

export default defineBackground({
  type: 'module',
  main() {
    registerSaveSelectionClickHandler();

    browser.runtime.onInstalled.addListener(() => {
      void browser.alarms.create(YUEL_MAINTENANCE_ALARM, { periodInMinutes: 60 });
      void enableSidePanelOnActionClick();
      void setupSaveSelectionContextMenu();
      void rehydrateEnabledSiteContentScripts();
    });

    browser.alarms.onAlarm.addListener((alarm) => {
      void runMaintenanceAlarm(alarm);
    });

    browser.runtime.onStartup.addListener(() => {
      void setupSaveSelectionContextMenu();
      void rehydrateEnabledSiteContentScripts();
    });

    browser.permissions.onRemoved.addListener((permissions) => {
      void syncRemovedHostPermissions(permissions);
    });

    browser.runtime.onMessage.addListener((message) => handleReadingRuntimeMessage(message));
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

async function rehydrateEnabledSiteContentScripts(): Promise<void> {
  try {
    await registerEnabledSiteContentScripts();
  } catch (error) {
    console.error('Failed to register Yuel enabled-site content scripts', error);
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

async function syncRemovedHostPermissions(permissions: { origins?: string[] }): Promise<void> {
  try {
    await handleHostPermissionsRemoved(permissions);
  } catch (error) {
    console.error('Failed to sync removed Yuel host permissions', error);
  }
}
