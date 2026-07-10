import { browser } from 'wxt/browser';

import {
  isReadingCollectorStatusResponse,
  MESSAGE_TYPES,
  type ReadingCollectorStatusRequest,
  type ReadingCollectorStatusResponse,
} from '../messaging/contracts';
import {
  CONTENT_SCRIPT_FILE,
  ENABLED_SITE_ORIGINS_KEY,
  getEnabledSiteOrigins,
  registerEnabledSiteContentScripts,
  type ContentScriptRegistrationRuntime,
} from './contentScriptRegistration';
import { isStarterSiteUrl } from './starterSites';
import { withCrossContextLock } from './crossContextLock';

export { CONTENT_SCRIPT_FILE, ENABLED_SITE_ORIGINS_KEY } from './contentScriptRegistration';

const ENABLED_SITE_MUTATION_LOCK = 'yuel-enabled-site-mutation';

export type ReadingCollectorState = 'recording' | 'idle';
export type SiteAccessUnavailableReason = 'unsupported-page' | 'tab-unavailable';

export interface SiteAccessTab {
  id?: number;
  url?: string;
  collectorState?: ReadingCollectorState;
}

export interface SiteAccessTabQuery {
  active?: boolean;
  currentWindow?: boolean;
  lastFocusedWindow?: boolean;
  url?: string[];
}

export interface SiteAccessRuntime extends ContentScriptRegistrationRuntime {
  tabs: {
    query: (queryInfo: SiteAccessTabQuery) => Promise<SiteAccessTab[]>;
    sendMessage: (tabId: number, message: ReadingCollectorStatusRequest) => Promise<unknown>;
  };
  permissions: {
    contains: (permissions: { origins: string[] }) => Promise<boolean>;
    request: (permissions: { origins: string[] }) => Promise<boolean>;
    remove: (permissions: { origins: string[] }) => Promise<boolean>;
  };
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (values: Record<string, unknown>) => Promise<void>;
    };
  };
  scripting: {
    executeScript: (
      injection: { target: { tabId: number }; files: string[] } | { target: { tabId: number }; func: () => unknown },
    ) => Promise<unknown>;
    getRegisteredContentScripts: ContentScriptRegistrationRuntime['scripting']['getRegisteredContentScripts'];
    unregisterContentScripts: (filter: { ids: string[] }) => Promise<void>;
    registerContentScripts: ContentScriptRegistrationRuntime['scripting']['registerContentScripts'];
    updateContentScripts: ContentScriptRegistrationRuntime['scripting']['updateContentScripts'];
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
  starterSite: boolean;
  collectorState?: ReadingCollectorState;
}

export interface UnsupportedSiteAccessState {
  supported: false;
  reason: SiteAccessUnavailableReason;
}

export interface EnabledSiteRecord {
  origin: string;
  host: string;
}

export interface DisableEnabledSiteResult {
  removed: boolean;
  remainingOrigins: string[];
}

export interface RemovedEnabledSitesResult {
  removedOrigins: string[];
  remainingOrigins: string[];
}

export interface HostPermissionsChange {
  origins?: string[];
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

    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return undefined;
  }
}

export async function listEnabledSites(runtime: SiteAccessRuntime = browser as SiteAccessRuntime): Promise<EnabledSiteRecord[]> {
  const origins = await getEnabledOrigins(runtime);
  return origins.map((origin) => ({
    origin,
    host: originToHost(origin),
  }));
}

export async function getCurrentTabSiteAccess(runtime: SiteAccessRuntime = browser as SiteAccessRuntime): Promise<SiteAccessState> {
  const tab = await getActiveTab(runtime);
  const url = tab?.url;

  if (!tab || !url) {
    return { supported: false, reason: 'tab-unavailable' };
  }

  const origin = toOptionalHostOrigin(url);
  if (!origin) {
    return { supported: false, reason: 'unsupported-page' };
  }

  const [granted, enabledOrigins] = await Promise.all([
    runtime.permissions.contains({ origins: [origin] }),
    getEnabledOrigins(runtime),
  ]);
  const starterSite = isStarterSiteUrl(url);

  return {
    supported: true,
    tabId: tab.id,
    url,
    origin,
    host: new URL(url).hostname,
    granted,
    enabled: starterSite || (granted && enabledOrigins.includes(origin)),
    starterSite,
    ...(tab.collectorState ? { collectorState: tab.collectorState } : {}),
  };
}

export function isUnsupportedPageAccess(
  siteAccess: SiteAccessState | undefined,
): siteAccess is UnsupportedSiteAccessState & { reason: 'unsupported-page' } {
  return siteAccess?.supported === false && siteAccess.reason === 'unsupported-page';
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

  if (access.starterSite) {
    return {
      ...access,
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

  let permissionStillGranted = false;
  await withCrossContextLock(ENABLED_SITE_MUTATION_LOCK, async () => {
    permissionStillGranted = await runtime.permissions.contains({ origins: [access.origin] });
    if (!permissionStillGranted) return;
    const enabledOrigins = await getEnabledOrigins(runtime);
    const originAlreadyEnabled = enabledOrigins.includes(access.origin);
    if (!originAlreadyEnabled) {
      await runtime.storage.local.set({
        [ENABLED_SITE_ORIGINS_KEY]: [...enabledOrigins, access.origin],
      });
    }
    try {
      await registerEnabledSiteContentScripts(runtime);
    } catch (error) {
      if (!originAlreadyEnabled) {
        await runtime.storage.local.set({ [ENABLED_SITE_ORIGINS_KEY]: enabledOrigins });
      }
      throw error;
    }
  });

  if (!permissionStillGranted) {
    return {
      ...access,
      granted: false,
      enabled: false,
      injected: false,
    };
  }

  const injected = await injectCollector(runtime, access.tabId);
  const collectorStatus = injected && typeof access.tabId === 'number'
    ? await getReadingCollectorStatus(runtime, access.tabId)
    : undefined;

  return {
    ...access,
    granted: true,
    enabled: true,
    collectorState: collectorStatus?.url === access.url
      ? collectorStatus.collecting ? 'recording' : 'idle'
      : undefined,
    injected,
  };
}

export async function disableEnabledSite(
  origin: string,
  runtime: SiteAccessRuntime = browser as SiteAccessRuntime,
): Promise<DisableEnabledSiteResult> {
  return withCrossContextLock(ENABLED_SITE_MUTATION_LOCK, async () => {
    const enabledOrigins = await getEnabledOrigins(runtime);
    if (!enabledOrigins.includes(origin)) {
      return {
        removed: false,
        remainingOrigins: enabledOrigins,
      };
    }

    const remainingOrigins = enabledOrigins.filter((enabledOrigin) => enabledOrigin !== origin);
    await stopCollectorsForOrigin(runtime, origin);
    const removedHostPermission = await runtime.permissions.remove({ origins: [origin] });
    const permissionStillGranted = !removedHostPermission
      && await runtime.permissions.contains({ origins: [origin] });
    if (permissionStillGranted) {
      throw new Error(`Failed to remove host permission for ${origin}`);
    }

    await runtime.storage.local.set({
      [ENABLED_SITE_ORIGINS_KEY]: remainingOrigins,
    });
    await registerEnabledSiteContentScripts(runtime);

    return {
      removed: true,
      remainingOrigins,
    };
  });
}

export async function removeEnabledSitesForOrigins(
  origins: string[],
  runtime: SiteAccessRuntime = browser as SiteAccessRuntime,
): Promise<RemovedEnabledSitesResult> {
  return withCrossContextLock(ENABLED_SITE_MUTATION_LOCK, async () => {
    const enabledOrigins = await getEnabledOrigins(runtime);
    const remainingOrigins = enabledOrigins.filter((enabledOrigin) => !isEnabledOriginCoveredByRemovedPermissions(enabledOrigin, origins));
    const removedOrigins = enabledOrigins.filter((enabledOrigin) => isEnabledOriginCoveredByRemovedPermissions(enabledOrigin, origins));

    if (removedOrigins.length === 0) {
      return {
        removedOrigins,
        remainingOrigins,
      };
    }

    for (const removedOrigin of removedOrigins) {
      await stopCollectorsForOrigin(runtime, removedOrigin);
    }

    await runtime.storage.local.set({
      [ENABLED_SITE_ORIGINS_KEY]: remainingOrigins,
    });
    await registerEnabledSiteContentScripts(runtime);

    return {
      removedOrigins,
      remainingOrigins,
    };
  });
}

export async function handleHostPermissionsRemoved(
  permissions: HostPermissionsChange,
  runtime: SiteAccessRuntime = browser as SiteAccessRuntime,
): Promise<RemovedEnabledSitesResult> {
  return removeEnabledSitesForOrigins(permissions.origins ?? [], runtime);
}

function isEnabledOriginCoveredByRemovedPermissions(enabledOrigin: string, removedOrigins: string[]): boolean {
  const enabled = parseStoredOrigin(enabledOrigin);
  return removedOrigins.some((removedOrigin) => {
    if (removedOrigin === enabledOrigin || removedOrigin === '<all_urls>') {
      return true;
    }

    if (removedOrigin === 'http://*/*') {
      return enabledOrigin.startsWith('http://');
    }

    if (removedOrigin === 'https://*/*') {
      return enabledOrigin.startsWith('https://');
    }

    const wildcardHost = parseWildcardHostRemovalOrigin(removedOrigin);
    if (!enabled || !wildcardHost || (wildcardHost.protocol && enabled.protocol !== wildcardHost.protocol)) {
      return false;
    }

    return enabled.hostname === wildcardHost.baseHost || enabled.hostname.endsWith(`.${wildcardHost.baseHost}`);
  });
}

function parseStoredOrigin(origin: string): URL | undefined {
  try {
    return new URL(origin.slice(0, -2));
  } catch {
    return undefined;
  }
}

function parseWildcardHostRemovalOrigin(origin: string): { protocol?: string; baseHost: string } | undefined {
  const match = /^(\*|https?):\/\/\*\.([^/*]+)\/\*$/.exec(origin);
  if (!match) {
    return undefined;
  }

  return {
    protocol: match[1] === '*' ? undefined : `${match[1]}:`,
    baseHost: match[2],
  };
}

async function getActiveTab(runtime: SiteAccessRuntime): Promise<SiteAccessTab | undefined> {
  const [lastFocusedTab] = await runtime.tabs.query({ active: true, lastFocusedWindow: true });
  const resolvedLastFocusedTab = await resolveCollectorBackedTab(lastFocusedTab, runtime);
  if (resolvedLastFocusedTab?.url && toOptionalHostOrigin(resolvedLastFocusedTab.url)) {
    return resolvedLastFocusedTab;
  }

  const [currentWindowTab] = await runtime.tabs.query({ active: true, currentWindow: true });
  const sameSnapshot = currentWindowTab?.id === lastFocusedTab?.id && currentWindowTab?.url === lastFocusedTab?.url;
  const resolvedCurrentWindowTab = sameSnapshot
    ? resolvedLastFocusedTab
    : await resolveCollectorBackedTab(currentWindowTab, runtime);
  if (resolvedCurrentWindowTab?.url && toOptionalHostOrigin(resolvedCurrentWindowTab.url)) {
    return resolvedCurrentWindowTab;
  }

  return resolvedCurrentWindowTab ?? resolvedLastFocusedTab;
}

async function resolveCollectorBackedTab(
  tab: SiteAccessTab | undefined,
  runtime: SiteAccessRuntime,
): Promise<SiteAccessTab | undefined> {
  if (!tab || typeof tab.id !== 'number') return tab;

  const collectorStatus = await getReadingCollectorStatus(runtime, tab.id);
  if (!collectorStatus || !toOptionalHostOrigin(collectorStatus.url)) return tab;

  return {
    ...tab,
    url: collectorStatus.url,
    collectorState: collectorStatus.collecting ? 'recording' : 'idle',
  };
}

async function getReadingCollectorStatus(
  runtime: SiteAccessRuntime,
  tabId: number,
): Promise<ReadingCollectorStatusResponse | undefined> {
  try {
    const response = await runtime.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.readingCollectorStatusRequest,
    });
    return isReadingCollectorStatusResponse(response) ? response : undefined;
  } catch {
    // A missing receiver is expected on sites where Yuel is not enabled.
    return undefined;
  }
}

async function getEnabledOrigins(runtime: SiteAccessRuntime): Promise<string[]> {
  return getEnabledSiteOrigins(runtime);
}

function originToHost(origin: string): string {
  return new URL(origin.slice(0, -2)).hostname;
}

async function stopCollectorsForOrigin(runtime: SiteAccessRuntime, origin: string): Promise<void> {
  let tabs: SiteAccessTab[];
  try {
    tabs = await runtime.tabs.query({ url: [origin] });
  } catch (error) {
    console.error('Failed to find Yuel tabs for a disabled site', error);
    return;
  }

  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== 'number') return;
    try {
      await runtime.scripting.executeScript({
        target: { tabId: tab.id },
        func: stopReadingCollectorInPage,
      });
    } catch (error) {
      console.error('Failed to stop Yuel collector on disabled site', error);
    }
  }));
}

export function stopReadingCollectorInPage(): boolean {
  const collectorKey = '__yuelReadingCollector';
  const pageContext = globalThis as Record<string, unknown>;
  const controller = pageContext[collectorKey] as { stop?: unknown } | undefined;
  if (!controller || typeof controller.stop !== 'function') {
    return false;
  }

  controller.stop();
  delete pageContext[collectorKey];
  return true;
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
