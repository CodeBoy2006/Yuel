import { describe, expect, it } from 'vitest';

import { createPdfReadingPageId } from './analytics/identity';
import type { PdfSourceMetadata } from './source';
import {
  clearPdfReaderSession,
  getCurrentPdfReaderState,
  getPdfReaderSessionStorageKey,
  publishPdfReaderSession,
  type PdfReaderSessionRuntime,
} from './sessionContext';

const resourceId = `pdf_${'a'.repeat(64)}`;
const metadata: PdfSourceMetadata = {
  resourceId,
  sha256: 'a'.repeat(64),
  kind: 'local',
  displayName: 'Architecture.pdf',
  byteLength: 1_024,
  mediaType: 'application/pdf',
};

function createRuntime({
  currentTab = { id: 17, url: 'chrome-extension://yuel/pdf-reader.html' },
  currentWindowTab = currentTab,
  lastFocusedTab = currentTab,
}: {
  currentTab?: { id?: number; url?: string };
  currentWindowTab?: { id?: number; url?: string };
  lastFocusedTab?: { id?: number; url?: string };
} = {}): PdfReaderSessionRuntime & {
  stored: Record<string, unknown>;
  removedKeys: string[];
} {
  const stored: Record<string, unknown> = {};
  const removedKeys: string[] = [];

  return {
    stored,
    removedKeys,
    runtime: {
      getURL(path) {
        return `chrome-extension://yuel${path}`;
      },
    },
    tabs: {
      async getCurrent() {
        return currentTab;
      },
      async query(queryInfo) {
        return [queryInfo.lastFocusedWindow ? lastFocusedTab : currentWindowTab];
      },
    },
    storage: {
      session: {
        async get(key) {
          return { [key]: stored[key] };
        },
        async set(items) {
          Object.assign(stored, items);
        },
        async remove(key) {
          removedKeys.push(key);
          delete stored[key];
        },
      },
    },
  };
}

describe('PDF reader session context', () => {
  it('publishes a stable PDF reading identity for the current reader tab', async () => {
    const runtime = createRuntime();
    const context = await publishPdfReaderSession(metadata, runtime, 1_234);

    expect(context).toEqual({
      tabId: 17,
      resourceId,
      pageId: createPdfReadingPageId(metadata),
      displayName: 'Architecture.pdf',
      domain: 'pdf.local',
      updatedAt: 1_234,
    });
    expect(runtime.stored[getPdfReaderSessionStorageKey(17)]).toEqual(context);
  });

  it('resolves the active PDF reader and its current document session', async () => {
    const runtime = createRuntime();
    const context = await publishPdfReaderSession(metadata, runtime, 1_234);

    await expect(getCurrentPdfReaderState(runtime)).resolves.toEqual({
      active: true,
      tabId: 17,
      session: context,
    });
  });

  it('recognizes an empty PDF reader without treating other extension pages as readers', async () => {
    const emptyReader = createRuntime();
    const dashboard = createRuntime({
      currentTab: { id: 18, url: 'chrome-extension://yuel/dashboard.html' },
      currentWindowTab: { id: 18, url: 'chrome-extension://yuel/dashboard.html' },
      lastFocusedTab: { id: 18, url: 'chrome-extension://yuel/dashboard.html' },
    });

    await expect(getCurrentPdfReaderState(emptyReader)).resolves.toEqual({
      active: true,
      tabId: 17,
    });
    await expect(getCurrentPdfReaderState(dashboard)).resolves.toEqual({
      active: false,
    });
  });

  it('falls back to the current window when the last focused tab is not the reader', async () => {
    const runtime = createRuntime({
      lastFocusedTab: { id: 2, url: 'https://example.com/article' },
      currentWindowTab: { id: 17, url: 'chrome-extension://yuel/pdf-reader.html' },
    });

    await expect(getCurrentPdfReaderState(runtime)).resolves.toEqual({
      active: true,
      tabId: 17,
    });
  });

  it('clears only the matching document session', async () => {
    const runtime = createRuntime();
    await publishPdfReaderSession(metadata, runtime, 1_234);

    await clearPdfReaderSession(`pdf_${'b'.repeat(64)}`, runtime);
    expect(runtime.removedKeys).toEqual([]);

    await clearPdfReaderSession(resourceId, runtime);
    expect(runtime.removedKeys).toEqual([getPdfReaderSessionStorageKey(17)]);
    expect(runtime.stored).toEqual({});
  });
});
