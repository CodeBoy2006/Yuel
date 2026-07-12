import { browser } from 'wxt/browser';

import {
  isReadingCollectorStatusResponse,
  MESSAGE_TYPES,
  type ReadingCollectorStatusRequest,
  type ReadingCollectorStatusResponse,
} from '../messaging/contracts';
import {
  getReadingRecordingSettings,
  getReadingSiteDomain,
  type ReadingRecordingSettings,
  type ReadingRecordingSettingsStore,
} from '../storage/readingRecordingSettings';

export type ReadingCollectorState = 'recording' | 'idle';
export type SiteAccessUnavailableReason = 'unsupported-page' | 'tab-unavailable';
export type SiteAccessDisabledReason = 'browser-restricted' | 'global-paused' | 'site-paused';

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
  storage?: {
    local: ReadingRecordingSettingsStore;
  };
}

export interface SupportedSiteAccessState {
  supported: true;
  tabId?: number;
  url: string;
  origin: string;
  host: string;
  granted: boolean;
  globalRecordingEnabled: boolean;
  siteRecordingEnabled: boolean;
  enabled: boolean;
  disabledReason?: SiteAccessDisabledReason;
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

  const [granted, recordingSettings] = await Promise.all([
    runtime.permissions.contains({ origins: [origin] }),
    getReadingRecordingSettings(runtime.storage?.local),
  ]);

  return applyReadingRecordingSettingsToSiteAccess({
    supported: true,
    tabId: tab.id,
    url,
    origin,
    host: new URL(url).hostname,
    granted,
    globalRecordingEnabled: true,
    siteRecordingEnabled: true,
    enabled: granted,
    ...(tab.collectorState ? { collectorState: tab.collectorState } : {}),
  }, recordingSettings);
}

export function applyReadingRecordingSettingsToSiteAccess(
  siteAccess: SiteAccessState,
  settings: ReadingRecordingSettings,
): SiteAccessState {
  if (!siteAccess.supported) return siteAccess;

  const domain = getReadingSiteDomain(siteAccess.url);
  const siteRecordingEnabled = domain
    ? !settings.excludedSiteDomains.includes(domain)
    : false;
  const disabledReason = !siteAccess.granted
    ? 'browser-restricted'
    : !settings.recordingEnabled
      ? 'global-paused'
      : !siteRecordingEnabled
        ? 'site-paused'
        : undefined;
  const collectorState = siteAccess.collectorState;
  const baseAccess = { ...siteAccess };
  delete baseAccess.disabledReason;
  delete baseAccess.collectorState;

  return {
    ...baseAccess,
    globalRecordingEnabled: settings.recordingEnabled,
    siteRecordingEnabled,
    enabled: disabledReason === undefined,
    ...(disabledReason ? { disabledReason } : {}),
    ...(!disabledReason && collectorState ? { collectorState } : {}),
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
