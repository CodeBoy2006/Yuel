import { browser } from 'wxt/browser';

import { ENABLED_SITE_ORIGINS_KEY } from '../permissions/contentScriptRegistration';
import { isStarterSiteUrl } from '../permissions/starterSites';

interface StorageChange {
  newValue?: unknown;
}

export interface EnabledSiteLifecycleRuntime {
  local: {
    get: (key: string) => Promise<Record<string, unknown>>;
  };
  onChanged: {
    addListener: (listener: (changes: Record<string, StorageChange>, areaName: string) => void) => void;
    removeListener: (listener: (changes: Record<string, StorageChange>, areaName: string) => void) => void;
  };
}

export function watchEnabledSiteAccess(
  url: string,
  onDisabled: () => void,
  runtime: EnabledSiteLifecycleRuntime = browser.storage as EnabledSiteLifecycleRuntime,
): () => void {
  if (isStarterSiteUrl(url)) return () => undefined;

  const origin = toHostOrigin(url);
  if (!origin) {
    onDisabled();
    return () => undefined;
  }

  let active = true;
  const stopIfDisabled = (value: unknown) => {
    if (!active || isOriginEnabled(value, origin)) return;
    active = false;
    runtime.onChanged.removeListener(handleStorageChange);
    onDisabled();
  };
  const handleStorageChange = (changes: Record<string, StorageChange>, areaName: string) => {
    if (areaName !== 'local' || !(ENABLED_SITE_ORIGINS_KEY in changes)) return;
    stopIfDisabled(changes[ENABLED_SITE_ORIGINS_KEY]?.newValue);
  };

  runtime.onChanged.addListener(handleStorageChange);
  void runtime.local
    .get(ENABLED_SITE_ORIGINS_KEY)
    .then((stored) => stopIfDisabled(stored[ENABLED_SITE_ORIGINS_KEY]))
    .catch((error) => {
      console.warn('Failed to verify Yuel enabled-site state in content script', error);
    });

  return () => {
    if (!active) return;
    active = false;
    runtime.onChanged.removeListener(handleStorageChange);
  };
}

function isOriginEnabled(value: unknown, origin: string): boolean {
  return Array.isArray(value) && value.includes(origin);
}

function toHostOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return undefined;
  }
}
