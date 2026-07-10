import { describe, expect, it } from 'vitest';

import { createPageId } from '../domain/events';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { ENABLED_SITE_ORIGINS_KEY } from '../permissions/contentScriptRegistration';
import { canRecordReadingBatch, type ReadingAccessRuntime } from './readingAccess';

function createPayload(url: string): ReadingEventBatchPayload {
  return {
    page: {
      pageId: createPageId(url),
      domain: new URL(url).hostname,
      titleHash: 'title',
      urlHash: 'url',
      language: 'en',
      totalWords: 0,
      capturedAt: 1,
    },
    chunks: [],
    events: [],
  };
}

function createRuntime(enabledOrigins: string[], granted: boolean): ReadingAccessRuntime {
  return {
    permissions: {
      async contains() {
        return granted;
      },
    },
    storage: {
      local: {
        async get() {
          return { [ENABLED_SITE_ORIGINS_KEY]: enabledOrigins };
        },
      },
    },
  };
}

describe('canRecordReadingBatch', () => {
  it('allows a matching manually enabled origin only while permission remains granted', async () => {
    const url = 'https://docs.example.com/article';
    const payload = createPayload(url);

    await expect(canRecordReadingBatch(payload, { tab: { url } }, createRuntime(['https://docs.example.com/*'], true))).resolves.toBe(true);
    await expect(canRecordReadingBatch(payload, { tab: { url } }, createRuntime(['https://docs.example.com/*'], false))).resolves.toBe(false);
  });

  it('rejects disabled origins and sender URLs that do not match the payload page', async () => {
    const url = 'https://docs.example.com/article';
    const runtime = createRuntime([], true);

    await expect(canRecordReadingBatch(createPayload(url), { tab: { url } }, runtime)).resolves.toBe(false);
    await expect(
      canRecordReadingBatch(createPayload(url), { tab: { url: 'https://other.example.com/article' } }, runtime),
    ).resolves.toBe(false);
  });

  it('accepts an old-route tail batch after same-origin SPA navigation', async () => {
    const payload = createPayload('https://docs.example.com/guide/old');
    const runtime = createRuntime(['https://docs.example.com/*'], true);

    await expect(
      canRecordReadingBatch(payload, { tab: { url: 'https://docs.example.com/guide/new' } }, runtime),
    ).resolves.toBe(true);
  });

  it('authorizes a cross-navigation tail batch against the sending document URL', async () => {
    const oldDocumentUrl = 'https://docs.example.com/guide/old';
    const runtime = createRuntime(['https://docs.example.com/*'], true);

    await expect(
      canRecordReadingBatch(
        createPayload(oldDocumentUrl),
        {
          url: oldDocumentUrl,
          tab: { url: 'https://other.example.com/next' },
        },
        runtime,
      ),
    ).resolves.toBe(true);
  });

  it('allows configured starter sites and trusted extension-page smoke messages', async () => {
    const starterUrl = 'https://developer.mozilla.org/en-US/docs/Web/API';
    await expect(
      canRecordReadingBatch(createPayload(starterUrl), { tab: { url: starterUrl } }, createRuntime([], false)),
    ).resolves.toBe(true);
    await expect(
      canRecordReadingBatch(createPayload('https://runtime.example/article'), { url: 'chrome-extension://id/dashboard.html' }),
    ).resolves.toBe(true);
  });
});
