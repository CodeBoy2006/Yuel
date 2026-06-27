import { browser } from 'wxt/browser';

export const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';
export const DYNAMIC_CONTENT_SCRIPT_ID = 'yuel-enabled-sites';
export const ENABLED_SITE_ORIGINS_KEY = 'yuel.enabledSiteOrigins';

export interface DynamicContentScriptDefinition {
  id: string;
  matches: string[];
  js: string[];
  runAt: 'document_idle';
  persistAcrossSessions: boolean;
}

export interface ContentScriptRegistrationRuntime {
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
    };
  };
  scripting: {
    unregisterContentScripts: (filter: { ids: string[] }) => Promise<void>;
    registerContentScripts: (scripts: DynamicContentScriptDefinition[]) => Promise<void>;
  };
}

export interface ContentScriptRegistrationResult {
  registered: boolean;
  matches: string[];
}

export async function getEnabledSiteOrigins(
  runtime: ContentScriptRegistrationRuntime = browser as ContentScriptRegistrationRuntime,
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
  const matches = await getEnabledSiteOrigins(runtime);

  await unregisterDynamicContentScript(runtime);
  if (matches.length === 0) {
    return { registered: false, matches };
  }

  await runtime.scripting.registerContentScripts([
    {
      id: DYNAMIC_CONTENT_SCRIPT_ID,
      matches,
      js: [CONTENT_SCRIPT_FILE],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);

  return { registered: true, matches };
}

function isEnabledSiteOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || !value.endsWith('/*')) {
    return false;
  }

  try {
    const origin = value.slice(0, -2);
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === origin;
  } catch {
    return false;
  }
}

async function unregisterDynamicContentScript(runtime: ContentScriptRegistrationRuntime): Promise<void> {
  try {
    await runtime.scripting.unregisterContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] });
  } catch (error) {
    console.warn('Failed to unregister existing Yuel dynamic content script', error);
  }
}
