import { describe, expect, it } from 'vitest';

import {
  CONTENT_SCRIPT_FILE,
  ENABLED_SITE_ORIGINS_KEY,
  enableCurrentTabSite,
  getCurrentTabSiteAccess,
  toOptionalHostOrigin,
  type SiteAccessRuntime,
} from './siteAccess';

function createRuntime({
  tabUrl = 'https://example.com/article?utm=1',
  tabId = 42,
  permissionGranted = false,
  requestResult = true,
  enabledOrigins = [],
}: {
  tabUrl?: string;
  tabId?: number;
  permissionGranted?: boolean;
  requestResult?: boolean;
  enabledOrigins?: string[];
} = {}): SiteAccessRuntime & {
  requestedOrigins: string[][];
  executedFiles: string[];
  registeredScripts: unknown[];
  unregisteredFilters: Array<{ ids: string[] }>;
  storedValues: Record<string, unknown>[];
} {
  let currentEnabledOrigins = enabledOrigins;
  const requestedOrigins: string[][] = [];
  const executedFiles: string[] = [];
  const registeredScripts: unknown[] = [];
  const unregisteredFilters: Array<{ ids: string[] }> = [];
  const storedValues: Record<string, unknown>[] = [];

  return {
    requestedOrigins,
    executedFiles,
    registeredScripts,
    unregisteredFilters,
    storedValues,
    tabs: {
      async query() {
        return [{ id: tabId, url: tabUrl }];
      },
    },
    permissions: {
      async contains({ origins }) {
        expect(origins).toEqual(['https://example.com/*']);
        return permissionGranted;
      },
      async request({ origins }) {
        requestedOrigins.push(origins);
        return requestResult;
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
      async executeScript({ target, files }) {
        expect(target).toEqual({ tabId });
        executedFiles.push(...files);
      },
      async unregisterContentScripts(filter) {
        unregisteredFilters.push(filter);
      },
      async registerContentScripts(scripts) {
        registeredScripts.push(...scripts);
      },
    },
  };
}

describe('toOptionalHostOrigin', () => {
  it('normalizes http and https page URLs into optional host permission origins', () => {
    expect(toOptionalHostOrigin('https://developer.mozilla.org/en-US/docs/Web/API')).toBe('https://developer.mozilla.org/*');
    expect(toOptionalHostOrigin('http://example.com/path#section')).toBe('http://example.com/*');
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
    });
  });

  it('marks unsupported current tabs without querying permissions', async () => {
    const runtime = createRuntime({ tabUrl: 'chrome://extensions' });
    const access = await getCurrentTabSiteAccess(runtime);

    expect(access).toEqual({
      supported: false,
      reason: 'Unsupported page',
    });
    expect(runtime.requestedOrigins).toEqual([]);
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
      injected: true,
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
});
