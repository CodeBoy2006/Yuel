import { browser } from 'wxt/browser';

import { getDomain } from '../domain/events';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { getEnabledSiteOrigins } from '../permissions/contentScriptRegistration';
import { isStarterSiteUrl } from '../permissions/starterSites';

export interface ReadingMessageSender {
  url?: string;
  tab?: { url?: string };
}

export interface ReadingAccessRuntime {
  permissions: {
    contains: (permissions: { origins: string[] }) => Promise<boolean>;
  };
  storage: {
    local: {
      get: (key: string) => Promise<Record<string, unknown>>;
    };
  };
}

export async function canRecordReadingBatch(
  payload: ReadingEventBatchPayload,
  sender: ReadingMessageSender | undefined,
  runtime: ReadingAccessRuntime = browser as ReadingAccessRuntime,
): Promise<boolean> {
  // MessageSender.url identifies the document that opened the channel. The tab
  // URL may already point at the next navigation while a pagehide batch drains.
  const senderUrl = sender?.url ?? sender?.tab?.url;
  if (!senderUrl) return false;

  const parsed = parseUrl(senderUrl);
  if (!parsed) return false;
  if (parsed.protocol === 'chrome-extension:' || parsed.protocol === 'moz-extension:') {
    return true;
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || getDomain(senderUrl) !== payload.page.domain) {
    return false;
  }
  if (isStarterSiteUrl(senderUrl)) {
    return true;
  }

  const origin = `${parsed.protocol}//${parsed.hostname}/*`;
  const [granted, enabledOrigins] = await Promise.all([
    runtime.permissions.contains({ origins: [origin] }),
    getEnabledSiteOrigins(runtime),
  ]);
  return granted && enabledOrigins.includes(origin);
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
