import { describe, expect, it } from 'vitest';

import { createPageId } from '../domain/events';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
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

function createRuntime(granted: boolean): ReadingAccessRuntime {
  return {
    permissions: {
      async contains() {
        return granted;
      },
    },
  };
}

describe('canRecordReadingBatch', () => {
  it('allows a matching web origin while required host access remains granted', async () => {
    const url = 'https://docs.example.com/article';
    const payload = createPayload(url);

    await expect(canRecordReadingBatch(payload, { tab: { url } }, createRuntime(true))).resolves.toBe(true);
    await expect(canRecordReadingBatch(payload, { tab: { url } }, createRuntime(false))).resolves.toBe(false);
  });

  it('rejects sender URLs that do not match the payload page', async () => {
    const url = 'https://docs.example.com/article';

    await expect(
      canRecordReadingBatch(
        createPayload(url),
        { tab: { url: 'https://other.example.com/article' } },
        createRuntime(true),
      ),
    ).resolves.toBe(false);
  });

  it('accepts an old-route tail batch after same-origin SPA navigation', async () => {
    const payload = createPayload('https://docs.example.com/guide/old');

    await expect(
      canRecordReadingBatch(
        payload,
        { tab: { url: 'https://docs.example.com/guide/new' } },
        createRuntime(true),
      ),
    ).resolves.toBe(true);
  });

  it('authorizes a cross-navigation tail batch against the sending document URL', async () => {
    const oldDocumentUrl = 'https://docs.example.com/guide/old';

    await expect(
      canRecordReadingBatch(
        createPayload(oldDocumentUrl),
        {
          url: oldDocumentUrl,
          tab: { url: 'https://other.example.com/next' },
        },
        createRuntime(true),
      ),
    ).resolves.toBe(true);
  });

  it('allows trusted extension-page smoke messages', async () => {
    await expect(
      canRecordReadingBatch(
        createPayload('https://runtime.example/article'),
        { url: 'chrome-extension://id/dashboard.html' },
      ),
    ).resolves.toBe(true);
  });
});
