import { browser } from 'wxt/browser';

import { getDomain } from '../domain/events';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import {
  getReadingRecordingSettings,
  isReadingRecordingEnabledForDomain,
  type ReadingRecordingSettingsStore,
} from '../storage/readingRecordingSettings';

export interface ReadingMessageSender {
  documentId?: string;
  frameId?: number;
  url?: string;
  tab?: {
    id?: number;
    url?: string;
  };
}

export interface ReadingAccessRuntime {
  permissions: {
    contains: (permissions: { origins: string[] }) => Promise<boolean>;
  };
  storage?: {
    local: ReadingRecordingSettingsStore;
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

  const settings = await getReadingRecordingSettings(runtime.storage?.local);
  if (!isReadingRecordingEnabledForDomain(settings, payload.page.domain)) {
    return false;
  }

  if (parsed.protocol === 'chrome-extension:' || parsed.protocol === 'moz-extension:') {
    return true;
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || getDomain(senderUrl) !== payload.page.domain) {
    return false;
  }

  return runtime.permissions.contains({
    origins: [`${parsed.protocol}//${parsed.hostname}/*`],
  });
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
