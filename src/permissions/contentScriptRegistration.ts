import { browser } from 'wxt/browser';

import { withCrossContextLock } from './crossContextLock';

export const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';
export const DYNAMIC_CONTENT_SCRIPT_ID = 'yuel-enabled-sites';
export const ENABLED_SITE_ORIGINS_KEY = 'yuel.enabledSiteOrigins';
const CONTENT_SCRIPT_REGISTRATION_LOCK = 'yuel-content-script-registration';

export interface DynamicContentScriptDefinition {
  id: string;
  matches: string[];
  js: string[];
  runAt: 'document_idle';
  persistAcrossSessions: boolean;
}

export interface EnabledSiteStorageRuntime {
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
    };
  };
}

export interface ContentScriptRegistrationRuntime extends EnabledSiteStorageRuntime {
  scripting: {
    getRegisteredContentScripts: (filter: { ids: string[] }) => Promise<Array<{ id: string }>>;
    unregisterContentScripts: (filter: { ids: string[] }) => Promise<void>;
    registerContentScripts: (scripts: DynamicContentScriptDefinition[]) => Promise<void>;
    updateContentScripts: (scripts: DynamicContentScriptDefinition[]) => Promise<void>;
  };
}

export interface ContentScriptRegistrationResult {
  registered: boolean;
  matches: string[];
}

export async function getEnabledSiteOrigins(
  runtime: EnabledSiteStorageRuntime = browser as EnabledSiteStorageRuntime,
): Promise<string[]> {
  const stored = await runtime.storage.local.get(ENABLED_SITE_ORIGINS_KEY);
  const value = stored[ENABLED_SITE_ORIGINS_KEY];
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter(isEnabledSiteOrigin)));
}

export async function registerEnabledSiteContentScripts(
  runtime: ContentScriptRegistrationRuntime = browser as ContentScriptRegistrationRuntime,
): Promise<ContentScriptRegistrationResult> {
  return withCrossContextLock(CONTENT_SCRIPT_REGISTRATION_LOCK, async () => {
    const matches = await getEnabledSiteOrigins(runtime);
    const [registeredScript] = await runtime.scripting.getRegisteredContentScripts({
      ids: [DYNAMIC_CONTENT_SCRIPT_ID],
    });

    if (matches.length === 0) {
      if (registeredScript) {
        await runtime.scripting.unregisterContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] });
      }
      return { registered: false, matches };
    }

    const definition: DynamicContentScriptDefinition = {
      id: DYNAMIC_CONTENT_SCRIPT_ID,
      matches,
      js: [CONTENT_SCRIPT_FILE],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    };
    if (registeredScript) {
      await runtime.scripting.updateContentScripts([definition]);
    } else {
      await runtime.scripting.registerContentScripts([definition]);
    }

    return { registered: true, matches };
  });
}

function isEnabledSiteOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || !value.endsWith('/*')) {
    return false;
  }

  try {
    const origin = value.slice(0, -2);
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.port === '' && parsed.origin === origin;
  } catch {
    return false;
  }
}
