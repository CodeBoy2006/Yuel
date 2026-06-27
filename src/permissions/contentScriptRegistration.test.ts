import { describe, expect, it } from 'vitest';

import {
  CONTENT_SCRIPT_FILE,
  DYNAMIC_CONTENT_SCRIPT_ID,
  ENABLED_SITE_ORIGINS_KEY,
  getEnabledSiteOrigins,
  registerEnabledSiteContentScripts,
  type ContentScriptRegistrationRuntime,
} from './contentScriptRegistration';

function createRuntime(enabledOrigins: unknown): ContentScriptRegistrationRuntime & {
  registeredScripts: unknown[];
  unregisteredFilters: Array<{ ids: string[] }>;
} {
  const registeredScripts: unknown[] = [];
  const unregisteredFilters: Array<{ ids: string[] }> = [];

  return {
    registeredScripts,
    unregisteredFilters,
    storage: {
      local: {
        async get(key) {
          expect(key).toBe(ENABLED_SITE_ORIGINS_KEY);
          return { [ENABLED_SITE_ORIGINS_KEY]: enabledOrigins };
        },
      },
    },
    scripting: {
      async unregisterContentScripts(filter) {
        unregisteredFilters.push(filter);
      },
      async registerContentScripts(scripts) {
        registeredScripts.push(...scripts);
      },
    },
  };
}

describe('getEnabledSiteOrigins', () => {
  it('returns unique http and https enabled origins from local storage', async () => {
    const origins = await getEnabledSiteOrigins(
      createRuntime([
        'https://example.com/*',
        'https://example.com/*',
        'http://docs.example.com/*',
        'chrome://extensions/*',
        42,
        'https://missing-wildcard.example.com',
      ]),
    );

    expect(origins).toEqual(['https://example.com/*', 'http://docs.example.com/*']);
  });
});

describe('registerEnabledSiteContentScripts', () => {
  it('registers a persistent content script for enabled origins', async () => {
    const runtime = createRuntime(['https://example.com/*', 'https://developer.mozilla.org/*']);
    const result = await registerEnabledSiteContentScripts(runtime);

    expect(runtime.unregisteredFilters).toEqual([{ ids: [DYNAMIC_CONTENT_SCRIPT_ID] }]);
    expect(runtime.registeredScripts).toEqual([
      {
        id: DYNAMIC_CONTENT_SCRIPT_ID,
        matches: ['https://example.com/*', 'https://developer.mozilla.org/*'],
        js: [CONTENT_SCRIPT_FILE],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
    expect(result).toEqual({
      registered: true,
      matches: ['https://example.com/*', 'https://developer.mozilla.org/*'],
    });
  });

  it('unregisters the dynamic content script and skips registration when no origins are enabled', async () => {
    const runtime = createRuntime([]);
    const result = await registerEnabledSiteContentScripts(runtime);

    expect(runtime.unregisteredFilters).toEqual([{ ids: [DYNAMIC_CONTENT_SCRIPT_ID] }]);
    expect(runtime.registeredScripts).toEqual([]);
    expect(result).toEqual({
      registered: false,
      matches: [],
    });
  });
});
