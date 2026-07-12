import { describe, expect, it } from 'vitest';

import { createPageId } from '../domain/events';
import type { ReadingEventBatchPayload } from '../messaging/contracts';
import { READING_RECORDING_SETTINGS_KEY } from '../storage/readingRecordingSettings';
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

function createRuntime(
  granted: boolean,
  settings: {
    recordingEnabled: boolean;
    excludedSiteDomains: string[];
  } = {
    recordingEnabled: true,
    excludedSiteDomains: [],
  },
): ReadingAccessRuntime {
  return {
    permissions: {
      async contains() {
        return granted;
      },
    },
    storage: {
      local: {
        async get() {
          return { [READING_RECORDING_SETTINGS_KEY]: settings };
        },
        async set() {
          return undefined;
        },
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

  it('rejects batches while global recording is paused', async () => {
    const url = 'https://docs.example.com/article';

    await expect(canRecordReadingBatch(
      createPayload(url),
      { url },
      createRuntime(true, {
        recordingEnabled: false,
        excludedSiteDomains: [],
      }),
    )).resolves.toBe(false);
  });

  it('rejects batches from an excluded site without affecting other domains', async () => {
    const settings = {
      recordingEnabled: true,
      excludedSiteDomains: ['docs.example.com'],
    };

    await expect(canRecordReadingBatch(
      createPayload('https://docs.example.com/article'),
      { url: 'https://docs.example.com/article' },
      createRuntime(true, settings),
    )).resolves.toBe(false);
    await expect(canRecordReadingBatch(
      createPayload('https://other.example.com/article'),
      { url: 'https://other.example.com/article' },
      createRuntime(true, settings),
    )).resolves.toBe(true);
  });

  it('allows trusted extension-page smoke messages', async () => {
    await expect(
      canRecordReadingBatch(
        createPayload('https://runtime.example/article'),
        { url: 'chrome-extension://id/dashboard.html' },
        createRuntime(true),
      ),
    ).resolves.toBe(true);
  });
});
