import { describe, expect, it } from 'vitest';

import { MESSAGE_TYPES } from '../messaging/contracts';
import { READING_RECORDING_SETTINGS_KEY } from '../storage/readingRecordingSettings';
import {
  getCurrentTabSiteAccess,
  toHostOrigin,
  type SiteAccessRuntime,
  type SiteAccessTabQuery,
} from './siteAccess';

function createRuntime({
  currentWindowTabId,
  currentWindowTabUrl,
  lastFocusedTabId,
  lastFocusedTabUrl,
  tabUrl = 'https://example.com/article?utm=1',
  tabId = 42,
  permissionGranted = true,
  recordingEnabled = true,
  excludedSiteDomains = [],
  hideTabUrls = false,
  collectorResponses = [],
}: {
  currentWindowTabId?: number;
  currentWindowTabUrl?: string;
  lastFocusedTabId?: number;
  lastFocusedTabUrl?: string;
  tabUrl?: string;
  tabId?: number;
  permissionGranted?: boolean;
  recordingEnabled?: boolean;
  excludedSiteDomains?: string[];
  hideTabUrls?: boolean;
  collectorResponses?: unknown[];
} = {}): SiteAccessRuntime & {
  containedOrigins: string[][];
  tabQueries: SiteAccessTabQuery[];
  sentTabMessages: Array<{ tabId: number; message: unknown }>;
} {
  const containedOrigins: string[][] = [];
  const tabQueries: SiteAccessTabQuery[] = [];
  const sentTabMessages: Array<{ tabId: number; message: unknown }> = [];
  const remainingCollectorResponses = [...collectorResponses];
  const visibleTabUrl = (url: string) => hideTabUrls ? undefined : url;

  return {
    containedOrigins,
    tabQueries,
    sentTabMessages,
    tabs: {
      async query(queryInfo) {
        tabQueries.push(queryInfo);
        if (queryInfo.lastFocusedWindow) {
          return [{ id: lastFocusedTabId ?? tabId, url: visibleTabUrl(lastFocusedTabUrl ?? tabUrl) }];
        }
        if (queryInfo.currentWindow) {
          return [{ id: currentWindowTabId ?? tabId, url: visibleTabUrl(currentWindowTabUrl ?? tabUrl) }];
        }
        return [{ id: tabId, url: visibleTabUrl(tabUrl) }];
      },
      async sendMessage(messageTabId, message) {
        sentTabMessages.push({ tabId: messageTabId, message });
        return remainingCollectorResponses.shift();
      },
    },
    permissions: {
      async contains({ origins }) {
        containedOrigins.push(origins);
        return permissionGranted;
      },
    },
    storage: {
      local: {
        async get() {
          return {
            [READING_RECORDING_SETTINGS_KEY]: {
              recordingEnabled,
              excludedSiteDomains,
            },
          };
        },
        async set() {
          return undefined;
        },
      },
    },
  };
}

describe('toHostOrigin', () => {
  it('normalizes http and https page URLs into host permission origins', () => {
    expect(toHostOrigin('https://developer.mozilla.org/en-US/docs/Web/API')).toBe('https://developer.mozilla.org/*');
    expect(toHostOrigin('http://example.com/path#section')).toBe('http://example.com/*');
    expect(toHostOrigin('https://example.com:8443/path#section')).toBe('https://example.com/*');
  });

  it('rejects browser-internal and unsupported URLs', () => {
    expect(toHostOrigin('chrome://extensions')).toBeUndefined();
    expect(toHostOrigin('about:blank')).toBeUndefined();
  });
});

describe('getCurrentTabSiteAccess', () => {
  it('reports required host access for the current web page', async () => {
    const runtime = createRuntime();

    await expect(getCurrentTabSiteAccess(runtime)).resolves.toEqual({
      supported: true,
      tabId: 42,
      url: 'https://example.com/article?utm=1',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      globalRecordingEnabled: true,
      siteRecordingEnabled: true,
      enabled: true,
    });
    expect(runtime.containedOrigins).toEqual([['https://example.com/*']]);
  });

  it('reports browser-restricted site access without offering app-level enablement', async () => {
    const access = await getCurrentTabSiteAccess(createRuntime({ permissionGranted: false }));

    expect(access).toMatchObject({
      supported: true,
      granted: false,
      disabledReason: 'browser-restricted',
      enabled: false,
    });
  });

  it('reports global and current-site pauses separately from browser access', async () => {
    const globalPause = await getCurrentTabSiteAccess(createRuntime({
      recordingEnabled: false,
    }));
    const sitePause = await getCurrentTabSiteAccess(createRuntime({
      excludedSiteDomains: ['example.com'],
    }));

    expect(globalPause).toMatchObject({
      supported: true,
      granted: true,
      globalRecordingEnabled: false,
      siteRecordingEnabled: true,
      disabledReason: 'global-paused',
      enabled: false,
    });
    expect(sitePause).toMatchObject({
      supported: true,
      granted: true,
      globalRecordingEnabled: true,
      siteRecordingEnabled: false,
      disabledReason: 'site-paused',
      enabled: false,
    });
  });

  it('recovers the active page and collector state when tab URL metadata is hidden', async () => {
    const runtime = createRuntime({
      hideTabUrls: true,
      collectorResponses: [{
        type: MESSAGE_TYPES.readingCollectorStatusResponse,
        url: 'https://example.com/article?utm=1',
        collecting: true,
      }],
    });

    const access = await getCurrentTabSiteAccess(runtime);

    expect(runtime.sentTabMessages).toEqual([{
      tabId: 42,
      message: { type: MESSAGE_TYPES.readingCollectorStatusRequest },
    }]);
    expect(access).toMatchObject({
      supported: true,
      url: 'https://example.com/article?utm=1',
      enabled: true,
      collectorState: 'recording',
    });
  });

  it('reports an unknown tab state when neither Chrome nor the collector exposes a URL', async () => {
    const runtime = createRuntime({ hideTabUrls: true });

    await expect(getCurrentTabSiteAccess(runtime)).resolves.toEqual({
      supported: false,
      reason: 'tab-unavailable',
    });
    expect(runtime.containedOrigins).toEqual([]);
  });

  it('reports an idle collector separately from active recording', async () => {
    const access = await getCurrentTabSiteAccess(createRuntime({
      collectorResponses: [{
        type: MESSAGE_TYPES.readingCollectorStatusResponse,
        url: 'https://example.com/article?utm=1',
        collecting: false,
      }],
    }));

    expect(access).toMatchObject({
      supported: true,
      enabled: true,
      collectorState: 'idle',
    });
  });

  it('marks browser-internal pages unsupported without checking host access', async () => {
    const runtime = createRuntime({ tabUrl: 'chrome://extensions' });

    await expect(getCurrentTabSiteAccess(runtime)).resolves.toEqual({
      supported: false,
      reason: 'unsupported-page',
    });
    expect(runtime.containedOrigins).toEqual([]);
  });

  it('falls back to the current window tab when the last focused tab is unsupported', async () => {
    const runtime = createRuntime({
      lastFocusedTabUrl: 'chrome://extensions',
      currentWindowTabUrl: 'https://example.com/article?utm=1',
    });

    const access = await getCurrentTabSiteAccess(runtime);

    expect(runtime.tabQueries).toEqual([
      { active: true, lastFocusedWindow: true },
      { active: true, currentWindow: true },
    ]);
    expect(access).toMatchObject({
      supported: true,
      tabId: 42,
      origin: 'https://example.com/*',
      host: 'example.com',
    });
  });
});
