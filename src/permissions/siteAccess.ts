import { browser } from 'wxt/browser';

import {
  isReadingCollectorStatusResponse,
  MESSAGE_TYPES,
  type ReadingCollectorStatusRequest,
  type ReadingCollectorStatusResponse,
} from '../messaging/contracts';

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
}

export interface SiteAccessRuntime {
  tabs: {
    query: (queryInfo: SiteAccessTabQuery) => Promise<SiteAccessTab[]>;
    sendMessage: (tabId: number, message: ReadingCollectorStatusRequest) => Promise<unknown>;
  };
  permissions: {
    contains: (permissions: { origins: string[] }) => Promise<boolean>;
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
  collectorState?: ReadingCollectorState;
}

export interface UnsupportedSiteAccessState {
  supported: false;
  reason: SiteAccessUnavailableReason;
}

export type SiteAccessState = SupportedSiteAccessState | UnsupportedSiteAccessState;

export function toHostOrigin(url: string): string | undefined {
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

export async function getCurrentTabSiteAccess(
  runtime: SiteAccessRuntime = browser as SiteAccessRuntime,
): Promise<SiteAccessState> {
  const tab = await getActiveTab(runtime);
  const url = tab?.url;

  if (!tab || !url) {
    return { supported: false, reason: 'tab-unavailable' };
  }

  const origin = toHostOrigin(url);
  if (!origin) {
    return { supported: false, reason: 'unsupported-page' };
  }

  const granted = await runtime.permissions.contains({ origins: [origin] });

  return {
    supported: true,
    tabId: tab.id,
    url,
    origin,
    host: new URL(url).hostname,
    granted,
    enabled: granted,
    ...(tab.collectorState ? { collectorState: tab.collectorState } : {}),
  };
}

export function isUnsupportedPageAccess(
  siteAccess: SiteAccessState | undefined,
): siteAccess is UnsupportedSiteAccessState & { reason: 'unsupported-page' } {
  return siteAccess?.supported === false && siteAccess.reason === 'unsupported-page';
}

async function getActiveTab(runtime: SiteAccessRuntime): Promise<SiteAccessTab | undefined> {
  const [lastFocusedTab] = await runtime.tabs.query({ active: true, lastFocusedWindow: true });
  const resolvedLastFocusedTab = await resolveCollectorBackedTab(lastFocusedTab, runtime);
  if (resolvedLastFocusedTab?.url && toHostOrigin(resolvedLastFocusedTab.url)) {
    return resolvedLastFocusedTab;
  }

  const [currentWindowTab] = await runtime.tabs.query({ active: true, currentWindow: true });
  const sameSnapshot = currentWindowTab?.id === lastFocusedTab?.id && currentWindowTab?.url === lastFocusedTab?.url;
  const resolvedCurrentWindowTab = sameSnapshot
    ? resolvedLastFocusedTab
    : await resolveCollectorBackedTab(currentWindowTab, runtime);
  if (resolvedCurrentWindowTab?.url && toHostOrigin(resolvedCurrentWindowTab.url)) {
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
  if (!collectorStatus || !toHostOrigin(collectorStatus.url)) return tab;

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
    return undefined;
  }
}
