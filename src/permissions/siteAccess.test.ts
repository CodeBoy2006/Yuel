import { describe, expect, it, vi } from 'vitest';

import { MESSAGE_TYPES } from '../messaging/contracts';
import {
  CONTENT_SCRIPT_FILE,
  ENABLED_SITE_ORIGINS_KEY,
  disableEnabledSite,
  enableCurrentTabSite,
  getCurrentTabSiteAccess,
  handleHostPermissionsRemoved,
  listEnabledSites,
  removeEnabledSitesForOrigins,
  toOptionalHostOrigin,
  type SiteAccessRuntime,
  type SiteAccessTab,
  type SiteAccessTabQuery,
} from './siteAccess';

function createRuntime({
  currentWindowTabId,
  currentWindowTabUrl,
  lastFocusedTabId,
  lastFocusedTabUrl,
  tabUrl = 'https://example.com/article?utm=1',
  tabId = 42,
  permissionGranted = false,
  requestResult = true,
  removeResult = true,
  enabledOrigins = [],
  matchingTabs,
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
  requestResult?: boolean;
  removeResult?: boolean;
  enabledOrigins?: string[];
  matchingTabs?: SiteAccessTab[];
  hideTabUrls?: boolean;
  collectorResponses?: unknown[];
} = {}): SiteAccessRuntime & {
  containedOrigins: string[][];
  requestedOrigins: string[][];
  removedOrigins: string[][];
  executedFiles: string[];
  executedFunctions: Array<() => unknown>;
  executedTabIds: number[];
  operationOrder: string[];
  registeredScripts: unknown[];
  updatedScripts: unknown[];
  tabQueries: SiteAccessTabQuery[];
  sentTabMessages: Array<{ tabId: number; message: unknown }>;
  unregisteredFilters: Array<{ ids: string[] }>;
  storedValues: Record<string, unknown>[];
} {
  let currentEnabledOrigins = enabledOrigins;
  let hasPermission = permissionGranted;
  const containedOrigins: string[][] = [];
  const requestedOrigins: string[][] = [];
  const removedOrigins: string[][] = [];
  const executedFiles: string[] = [];
  const executedFunctions: Array<() => unknown> = [];
  const executedTabIds: number[] = [];
  const operationOrder: string[] = [];
  const registeredScripts: unknown[] = [];
  const updatedScripts: unknown[] = [];
  const tabQueries: SiteAccessTabQuery[] = [];
  const sentTabMessages: Array<{ tabId: number; message: unknown }> = [];
  const unregisteredFilters: Array<{ ids: string[] }> = [];
  const storedValues: Record<string, unknown>[] = [];
  let dynamicScriptRegistered = false;
  const remainingCollectorResponses = [...collectorResponses];

  const visibleTabUrl = (url: string) => hideTabUrls ? undefined : url;

  return {
    containedOrigins,
    requestedOrigins,
    removedOrigins,
    executedFiles,
    executedFunctions,
    executedTabIds,
    operationOrder,
    registeredScripts,
    updatedScripts,
    tabQueries,
    sentTabMessages,
    unregisteredFilters,
    storedValues,
    tabs: {
      async query(queryInfo) {
        tabQueries.push(queryInfo);
        if (queryInfo.url) {
          return matchingTabs ?? [{ id: tabId, url: tabUrl }];
        }
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
        return hasPermission;
      },
      async request({ origins }) {
        requestedOrigins.push(origins);
        if (requestResult) hasPermission = true;
        return requestResult;
      },
      async remove({ origins }) {
        operationOrder.push('permissions.remove');
        removedOrigins.push(origins);
        if (removeResult) hasPermission = false;
        return removeResult;
      },
    },
    storage: {
      local: {
        async get(key) {
          expect(key).toBe(ENABLED_SITE_ORIGINS_KEY);
          return { [ENABLED_SITE_ORIGINS_KEY]: currentEnabledOrigins };
        },
        async set(values) {
          storedValues.push(values);
          currentEnabledOrigins = values[ENABLED_SITE_ORIGINS_KEY] as string[];
        },
      },
    },
    scripting: {
      async executeScript(injection: { target: { tabId: number }; files?: string[]; func?: () => unknown }) {
        executedTabIds.push(injection.target.tabId);
        if (injection.files) {
          operationOrder.push('scripting.executeScript.files');
          executedFiles.push(...injection.files);
        }
        if (injection.func) {
          operationOrder.push('scripting.executeScript.func');
          executedFunctions.push(injection.func);
        }
      },
      async getRegisteredContentScripts() {
        return dynamicScriptRegistered ? [{ id: 'yuel-enabled-sites' }] : [];
      },
      async unregisterContentScripts(filter) {
        unregisteredFilters.push(filter);
        dynamicScriptRegistered = false;
      },
      async registerContentScripts(scripts) {
        registeredScripts.push(...scripts);
        dynamicScriptRegistered = true;
      },
      async updateContentScripts(scripts) {
        updatedScripts.push(...scripts);
      },
    },
  };
}

describe('toOptionalHostOrigin', () => {
  it('normalizes http and https page URLs into optional host permission origins', () => {
    expect(toOptionalHostOrigin('https://developer.mozilla.org/en-US/docs/Web/API')).toBe('https://developer.mozilla.org/*');
    expect(toOptionalHostOrigin('http://example.com/path#section')).toBe('http://example.com/*');
    expect(toOptionalHostOrigin('https://example.com:8443/path#section')).toBe('https://example.com/*');
  });

  it('rejects browser-internal and unsupported URLs', () => {
    expect(toOptionalHostOrigin('chrome://extensions')).toBeUndefined();
    expect(toOptionalHostOrigin('about:blank')).toBeUndefined();
  });
});

describe('getCurrentTabSiteAccess', () => {
  it('reports the current tab host permission and persisted enablement state', async () => {
    const access = await getCurrentTabSiteAccess(
      createRuntime({
        permissionGranted: true,
        enabledOrigins: ['https://example.com/*'],
      }),
    );

    expect(access).toEqual({
      supported: true,
      tabId: 42,
      url: 'https://example.com/article?utm=1',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      enabled: true,
      starterSite: false,
    });
  });

  it('does not report stale persisted enablement after host permission is gone', async () => {
    const access = await getCurrentTabSiteAccess(
      createRuntime({
        permissionGranted: false,
        enabledOrigins: ['https://example.com/*'],
      }),
    );

    expect(access).toMatchObject({
      supported: true,
      granted: false,
      enabled: false,
    });
  });

  it('marks starter static sites as enabled without optional host permission', async () => {
    const runtime = createRuntime({
      tabUrl: 'https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver',
      permissionGranted: false,
    });

    const access = await getCurrentTabSiteAccess(runtime);

    expect(runtime.containedOrigins).toEqual([['https://developer.mozilla.org/*']]);
    expect(access).toEqual({
      supported: true,
      tabId: 42,
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver',
      origin: 'https://developer.mozilla.org/*',
      host: 'developer.mozilla.org',
      granted: false,
      enabled: true,
      starterSite: true,
    });
  });

  it('recovers the real recording page from its collector when tab URL metadata is hidden', async () => {
    const runtime = createRuntime({
      hideTabUrls: true,
      permissionGranted: true,
      enabledOrigins: ['https://example.com/*'],
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
      host: 'example.com',
      enabled: true,
      collectorState: 'recording',
    });
  });

  it('reports an unknown tab state instead of an unsupported page when URL metadata is hidden', async () => {
    const runtime = createRuntime({ hideTabUrls: true });

    const access = await getCurrentTabSiteAccess(runtime);

    expect(access).toEqual({
      supported: false,
      reason: 'tab-unavailable',
    });
    expect(runtime.containedOrigins).toEqual([]);
  });

  it('reports an enabled collector that found no recordable English separately from active recording', async () => {
    const access = await getCurrentTabSiteAccess(createRuntime({
      permissionGranted: true,
      enabledOrigins: ['https://example.com/*'],
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

  it('marks unsupported current tabs without querying permissions', async () => {
    const runtime = createRuntime({ tabUrl: 'chrome://extensions' });
    const access = await getCurrentTabSiteAccess(runtime);

    expect(access).toEqual({
      supported: false,
      reason: 'unsupported-page',
    });
    expect(runtime.requestedOrigins).toEqual([]);
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

describe('listEnabledSites', () => {
  it('returns display-ready enabled site records', async () => {
    const sites = await listEnabledSites(
      createRuntime({
        enabledOrigins: ['https://example.com/*', 'http://docs.example.com/*'],
      }),
    );

    expect(sites).toEqual([
      { origin: 'https://example.com/*', host: 'example.com' },
      { origin: 'http://docs.example.com/*', host: 'docs.example.com' },
    ]);
  });
});

describe('enableCurrentTabSite', () => {
  it('requests host permission, persists the enabled origin, and injects the collector', async () => {
    const runtime = createRuntime({ enabledOrigins: ['https://old.example/*'] });
    const result = await enableCurrentTabSite(runtime);

    expect(runtime.requestedOrigins).toEqual([['https://example.com/*']]);
    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['https://old.example/*', 'https://example.com/*'],
      },
    ]);
    expect(runtime.executedFiles).toEqual([CONTENT_SCRIPT_FILE]);
    expect(runtime.registeredScripts).toEqual([
      expect.objectContaining({
        matches: ['https://old.example/*', 'https://example.com/*'],
        js: [CONTENT_SCRIPT_FILE],
      }),
    ]);
    expect(result).toEqual({
      supported: true,
      tabId: 42,
      url: 'https://example.com/article?utm=1',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      enabled: true,
      starterSite: false,
      injected: true,
    });
  });

  it('does not request optional host permission for starter static sites', async () => {
    const runtime = createRuntime({
      tabUrl: 'https://en.wikipedia.org/wiki/Readability',
      permissionGranted: false,
    });

    const result = await enableCurrentTabSite(runtime);

    expect(runtime.requestedOrigins).toEqual([]);
    expect(runtime.storedValues).toEqual([]);
    expect(runtime.executedFiles).toEqual([]);
    expect(result).toEqual({
      supported: true,
      tabId: 42,
      url: 'https://en.wikipedia.org/wiki/Readability',
      origin: 'https://en.wikipedia.org/*',
      host: 'en.wikipedia.org',
      granted: false,
      enabled: true,
      starterSite: true,
      injected: false,
    });
  });

  it('does not persist or inject when the permission request is denied', async () => {
    const runtime = createRuntime({ requestResult: false });
    const result = await enableCurrentTabSite(runtime);

    expect(runtime.storedValues).toEqual([]);
    expect(runtime.executedFiles).toEqual([]);
    expect(result).toMatchObject({
      supported: true,
      granted: false,
      enabled: false,
      injected: false,
    });
  });

  it('does not persist enablement if permission is revoked before the locked mutation', async () => {
    const runtime = createRuntime();
    runtime.permissions.contains = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    const result = await enableCurrentTabSite(runtime);

    expect(runtime.storedValues).toEqual([]);
    expect(runtime.executedFiles).toEqual([]);
    expect(result).toMatchObject({
      supported: true,
      granted: false,
      enabled: false,
      injected: false,
    });
  });

  it('rolls back the enabled origin when dynamic content-script registration fails', async () => {
    const runtime = createRuntime({ enabledOrigins: ['https://old.example/*'] });
    runtime.scripting.registerContentScripts = async () => {
      throw new Error('registration failed');
    };

    await expect(enableCurrentTabSite(runtime)).rejects.toThrow('registration failed');

    expect(runtime.storedValues).toEqual([
      { [ENABLED_SITE_ORIGINS_KEY]: ['https://old.example/*', 'https://example.com/*'] },
      { [ENABLED_SITE_ORIGINS_KEY]: ['https://old.example/*'] },
    ]);
    expect(runtime.executedFiles).toEqual([]);
  });

  it('preserves concurrent enables from separate extension contexts', async () => {
    const first = createRuntime({ tabUrl: 'https://alpha.example/article' });
    const second = createRuntime({ tabUrl: 'https://beta.example/article' });
    let sharedOrigins: string[] = [];
    const sharedStorage = {
      async get(key: string) {
        expect(key).toBe(ENABLED_SITE_ORIGINS_KEY);
        return { [ENABLED_SITE_ORIGINS_KEY]: [...sharedOrigins] };
      },
      async set(values: Record<string, unknown>) {
        sharedOrigins = [...values[ENABLED_SITE_ORIGINS_KEY] as string[]];
      },
    };
    first.storage.local = sharedStorage;
    second.storage.local = sharedStorage;

    await Promise.all([enableCurrentTabSite(first), enableCurrentTabSite(second)]);

    expect(sharedOrigins).toEqual([
      'https://alpha.example/*',
      'https://beta.example/*',
    ]);
    expect(second.registeredScripts.at(-1)).toEqual(
      expect.objectContaining({ matches: sharedOrigins }),
    );
  });
});

describe('disableEnabledSite', () => {
  it('removes the enabled origin, removes host permission, and refreshes dynamic scripts', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*'],
    });

    const result = await disableEnabledSite('https://example.com/*', runtime);

    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['https://old.example/*'],
      },
    ]);
    expect(runtime.removedOrigins).toEqual([['https://example.com/*']]);
    expect(runtime.registeredScripts).toEqual([
      expect.objectContaining({
        matches: ['https://old.example/*'],
        js: [CONTENT_SCRIPT_FILE],
      }),
    ]);
    expect(result).toEqual({
      removed: true,
      remainingOrigins: ['https://old.example/*'],
    });
  });

  it('stops the collector in the current tab before removing a matching enabled origin', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*'],
    });

    await disableEnabledSite('https://example.com/*', runtime);

    expect(runtime.executedFunctions).toHaveLength(1);
    expect(runtime.operationOrder).toContain('scripting.executeScript.func');
    expect(runtime.operationOrder.indexOf('scripting.executeScript.func')).toBeLessThan(
      runtime.operationOrder.indexOf('permissions.remove'),
    );

    const stop = vi.fn();
    const pageContext = globalThis as { __yuelReadingCollector?: { stop: () => void } };
    pageContext.__yuelReadingCollector = { stop };
    try {
      expect(runtime.executedFunctions[0]()).toBe(true);
      expect(stop).toHaveBeenCalledOnce();
      expect(pageContext.__yuelReadingCollector).toBeUndefined();
    } finally {
      delete pageContext.__yuelReadingCollector;
    }
  });

  it('stops collectors in every open tab for the disabled origin', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://example.com/*'],
      matchingTabs: [
        { id: 11, url: 'https://example.com/one' },
        { id: 12, url: 'https://example.com/two' },
      ],
    });

    await disableEnabledSite('https://example.com/*', runtime);

    expect(runtime.executedTabIds).toEqual([11, 12]);
    expect(runtime.executedFunctions).toHaveLength(2);
  });

  it('does not update local enablement when host permission removal is refused', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*'],
      permissionGranted: true,
      removeResult: false,
    });

    await expect(disableEnabledSite('https://example.com/*', runtime)).rejects.toThrow(
      'Failed to remove host permission for https://example.com/*',
    );

    expect(runtime.removedOrigins).toEqual([['https://example.com/*']]);
    expect(runtime.storedValues).toEqual([]);
    expect(runtime.registeredScripts).toEqual([]);
  });

  it('removes stale enablement when the host permission is already absent', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*'],
      permissionGranted: false,
      removeResult: false,
    });

    const result = await disableEnabledSite('https://example.com/*', runtime);

    expect(runtime.removedOrigins).toEqual([['https://example.com/*']]);
    expect(runtime.containedOrigins).toEqual([['https://example.com/*']]);
    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['https://old.example/*'],
      },
    ]);
    expect(runtime.registeredScripts).toEqual([
      expect.objectContaining({ matches: ['https://old.example/*'] }),
    ]);
    expect(result).toEqual({
      removed: true,
      remainingOrigins: ['https://old.example/*'],
    });
  });

  it('does not update storage or permissions for an unknown origin', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*'],
    });

    const result = await disableEnabledSite('https://missing.example/*', runtime);

    expect(runtime.storedValues).toEqual([]);
    expect(runtime.removedOrigins).toEqual([]);
    expect(result).toEqual({
      removed: false,
      remainingOrigins: ['https://old.example/*'],
    });
  });

  it('serializes an enable with a concurrent disable without losing either mutation', async () => {
    const enabling = createRuntime({ tabUrl: 'https://new.example/article' });
    const disabling = createRuntime({ tabUrl: 'https://old.example/article' });
    let sharedOrigins = ['https://old.example/*'];
    const sharedStorage = {
      async get(key: string) {
        expect(key).toBe(ENABLED_SITE_ORIGINS_KEY);
        return { [ENABLED_SITE_ORIGINS_KEY]: [...sharedOrigins] };
      },
      async set(values: Record<string, unknown>) {
        sharedOrigins = [...values[ENABLED_SITE_ORIGINS_KEY] as string[]];
      },
    };
    enabling.storage.local = sharedStorage;
    disabling.storage.local = sharedStorage;

    await Promise.all([
      enableCurrentTabSite(enabling),
      disableEnabledSite('https://old.example/*', disabling),
    ]);

    expect(sharedOrigins).toEqual(['https://new.example/*']);
    expect([...enabling.registeredScripts, ...disabling.registeredScripts]).toContainEqual(
      expect.objectContaining({ matches: sharedOrigins }),
    );
  });
});

describe('removeEnabledSitesForOrigins', () => {
  it('removes externally revoked host permissions from enabled sites and refreshes dynamic scripts', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*'],
    });

    const result = await removeEnabledSitesForOrigins(['https://example.com/*'], runtime);

    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['https://old.example/*'],
      },
    ]);
    expect(runtime.registeredScripts).toEqual([
      expect.objectContaining({
        matches: ['https://old.example/*'],
        js: [CONTENT_SCRIPT_FILE],
      }),
    ]);
    expect(result).toEqual({
      removedOrigins: ['https://example.com/*'],
      remainingOrigins: ['https://old.example/*'],
    });
  });

  it('stops the collector in the current tab when externally revoked permissions cover it', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*'],
    });

    await removeEnabledSitesForOrigins(['https://example.com/*'], runtime);

    expect(runtime.executedFunctions).toHaveLength(1);

    const stop = vi.fn();
    const pageContext = globalThis as { __yuelReadingCollector?: { stop: () => void } };
    pageContext.__yuelReadingCollector = { stop };
    try {
      expect(runtime.executedFunctions[0]()).toBe(true);
      expect(stop).toHaveBeenCalledOnce();
      expect(pageContext.__yuelReadingCollector).toBeUndefined();
    } finally {
      delete pageContext.__yuelReadingCollector;
    }
  });
});

describe('handleHostPermissionsRemoved', () => {
  it('cleans enabled sites from browser permission removal events', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*'],
    });

    const result = await handleHostPermissionsRemoved({ origins: ['https://example.com/*'] }, runtime);

    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['https://old.example/*'],
      },
    ]);
    expect(result).toEqual({
      removedOrigins: ['https://example.com/*'],
      remainingOrigins: ['https://old.example/*'],
    });
  });

  it('cleans enabled sites covered by broad browser permission removal events', async () => {
    const runtime = createRuntime({
      enabledOrigins: ['https://old.example/*', 'https://example.com/*', 'http://docs.example/*'],
    });

    const result = await handleHostPermissionsRemoved({ origins: ['https://*/*'] }, runtime);

    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['http://docs.example/*'],
      },
    ]);
    expect(runtime.registeredScripts).toEqual([
      expect.objectContaining({
        matches: ['http://docs.example/*'],
        js: [CONTENT_SCRIPT_FILE],
      }),
    ]);
    expect(result).toEqual({
      removedOrigins: ['https://old.example/*', 'https://example.com/*'],
      remainingOrigins: ['http://docs.example/*'],
    });
  });

  it('cleans enabled sites covered by wildcard-host permission removal events', async () => {
    const runtime = createRuntime({
      enabledOrigins: [
        'https://example.com/*',
        'https://docs.example.com/*',
        'http://docs.example.com/*',
        'https://other.example.org/*',
      ],
    });

    const result = await handleHostPermissionsRemoved({ origins: ['https://*.example.com/*'] }, runtime);

    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['http://docs.example.com/*', 'https://other.example.org/*'],
      },
    ]);
    expect(runtime.registeredScripts).toEqual([
      expect.objectContaining({
        matches: ['http://docs.example.com/*', 'https://other.example.org/*'],
        js: [CONTENT_SCRIPT_FILE],
      }),
    ]);
    expect(result).toEqual({
      removedOrigins: ['https://example.com/*', 'https://docs.example.com/*'],
      remainingOrigins: ['http://docs.example.com/*', 'https://other.example.org/*'],
    });
  });

  it('cleans enabled sites covered by scheme-wildcard host permission removal events', async () => {
    const runtime = createRuntime({
      enabledOrigins: [
        'https://example.com/*',
        'http://docs.example.com/*',
        'https://other.example.org/*',
      ],
    });

    const result = await handleHostPermissionsRemoved({ origins: ['*://*.example.com/*'] }, runtime);

    expect(runtime.storedValues).toEqual([
      {
        [ENABLED_SITE_ORIGINS_KEY]: ['https://other.example.org/*'],
      },
    ]);
    expect(runtime.registeredScripts).toEqual([
      expect.objectContaining({
        matches: ['https://other.example.org/*'],
        js: [CONTENT_SCRIPT_FILE],
      }),
    ]);
    expect(result).toEqual({
      removedOrigins: ['https://example.com/*', 'http://docs.example.com/*'],
      remainingOrigins: ['https://other.example.org/*'],
    });
  });
});
