import { browser } from 'wxt/browser';

import {
  CONTENT_SCRIPT_FILE,
  ENABLED_SITE_ORIGINS_KEY,
  getEnabledSiteOrigins,
  registerEnabledSiteContentScripts,
  type ContentScriptRegistrationRuntime,
} from './contentScriptRegistration';

export { CONTENT_SCRIPT_FILE, ENABLED_SITE_ORIGINS_KEY } from './contentScriptRegistration';

export interface SiteAccessTab {
  id?: number;
  url?: string;
}

export interface SiteAccessRuntime extends ContentScriptRegistrationRuntime {
  tabs: {
    query: (queryInfo: { active: boolean; currentWindow: boolean }) => Promise<SiteAccessTab[]>;
  };
  permissions: {
    contains: (permissions: { origins: string[] }) => Promise<boolean>;
    request: (permissions: { origins: string[] }) => Promise<boolean>;
  };
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (values: Record<string, unknown>) => Promise<void>;
    };
  };
  scripting: {
    executeScript: (injection: { target: { tabId: number }; files: string[] }) => Promise<unknown>;
    unregisterContentScripts: (filter: { ids: string[] }) => Promise<void>;
    registerContentScripts: ContentScriptRegistrationRuntime['scripting']['registerContentScripts'];
  };
}

export interface SupportedSiteAccessState {
  supported: true;
  tabId?: number;
  url: string;
  origin: string;
  host: string;
  granted: boolean;
  enabled: boolean;
}

export interface UnsupportedSiteAccessState {
  supported: false;
  reason: string;
}

export type SiteAccessState = SupportedSiteAccessState | UnsupportedSiteAccessState;

export type SiteEnableResult =
  | (SupportedSiteAccessState & {
      injected: boolean;
    })
  | (UnsupportedSiteAccessState & {
      granted: false;
      enabled: false;
      injected: false;
    });

export function toOptionalHostOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    return `${parsed.origin}/*`;
  } catch {
    return undefined;
  }
}

export async function getCurrentTabSiteAccess(runtime: SiteAccessRuntime = browser as SiteAccessRuntime): Promise<SiteAccessState> {
  const tab = await getActiveTab(runtime);
  const url = tab?.url;
  const origin = url ? toOptionalHostOrigin(url) : undefined;

  if (!tab || !url || !origin) {
    return { supported: false, reason: 'Unsupported page' };
  }

  const [granted, enabledOrigins] = await Promise.all([
    runtime.permissions.contains({ origins: [origin] }),
    getEnabledOrigins(runtime),
  ]);

  return {
    supported: true,
    tabId: tab.id,
    url,
    origin,
    host: new URL(url).hostname,
    granted,
    enabled: enabledOrigins.includes(origin),
  };
}

export async function enableCurrentTabSite(runtime: SiteAccessRuntime = browser as SiteAccessRuntime): Promise<SiteEnableResult> {
  const access = await getCurrentTabSiteAccess(runtime);

  if (!access.supported) {
    return {
      ...access,
      granted: false,
      enabled: false,
      injected: false,
    };
  }

  const granted = access.granted || (await runtime.permissions.request({ origins: [access.origin] }));
  if (!granted) {
    return {
      ...access,
      granted: false,
      enabled: false,
      injected: false,
    };
  }

  await persistEnabledOrigin(runtime, access.origin);
  await registerEnabledSiteContentScripts(runtime);

  return {
    ...access,
    granted: true,
    enabled: true,
    injected: await injectCollector(runtime, access.tabId),
  };
}

async function getActiveTab(runtime: SiteAccessRuntime): Promise<SiteAccessTab | undefined> {
  const [tab] = await runtime.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getEnabledOrigins(runtime: SiteAccessRuntime): Promise<string[]> {
  return getEnabledSiteOrigins(runtime);
}

async function persistEnabledOrigin(runtime: SiteAccessRuntime, origin: string): Promise<void> {
  const enabledOrigins = await getEnabledOrigins(runtime);
  if (enabledOrigins.includes(origin)) {
    return;
  }

  await runtime.storage.local.set({
    [ENABLED_SITE_ORIGINS_KEY]: [...enabledOrigins, origin],
  });
}

async function injectCollector(runtime: SiteAccessRuntime, tabId: number | undefined): Promise<boolean> {
  if (typeof tabId !== 'number') {
    return false;
  }

  try {
    await runtime.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
    return true;
  } catch (error) {
    console.error('Failed to inject Yuel collector', error);
    return false;
  }
}
