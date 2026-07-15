import { describe, expect, it } from 'vitest';

import type { RegisteredReadingPageSnapshot } from './readingSnapshotRegistry';
import {
  createReadingSenderScope,
  InMemoryReadingPageSnapshotRegistry,
} from './readingSnapshotRegistry';

const snapshot: RegisteredReadingPageSnapshot = {
  page: {
    pageId: 'docs.example.com_page',
    domain: 'docs.example.com',
    titleHash: 'title',
    urlHash: 'url',
    language: 'en',
    totalWords: 0,
    capturedAt: 1,
  },
  chunks: [],
};

describe('InMemoryReadingPageSnapshotRegistry', () => {
  it('binds snapshots to the sending document scope', () => {
    const registry = new InMemoryReadingPageSnapshotRegistry();
    const sender = {
      documentId: 'document-1',
      tab: { id: 7, url: 'https://docs.example.com/guide' },
      frameId: 0,
    };

    expect(registry.register('snapshot-1', snapshot, sender)).toBe(true);
    expect(registry.resolve('snapshot-1', sender)).toBe(snapshot);
    expect(registry.resolve('snapshot-1', {
      ...sender,
      documentId: 'document-2',
    })).toBeUndefined();
  });

  it('expires inactive snapshots and evicts the least recently used entry', () => {
    let now = 0;
    const registry = new InMemoryReadingPageSnapshotRegistry({
      maxSnapshots: 2,
      snapshotTtlMs: 100,
      now: () => now,
    });
    const sender = { tab: { id: 7 }, frameId: 0 };

    registry.register('snapshot-1', snapshot, sender);
    now = 10;
    registry.register('snapshot-2', snapshot, sender);
    now = 20;
    expect(registry.resolve('snapshot-1', sender)).toBe(snapshot);
    registry.register('snapshot-3', snapshot, sender);

    expect(registry.resolve('snapshot-2', sender)).toBeUndefined();
    expect(registry.resolve('snapshot-1', sender)).toBe(snapshot);
    now = 120;
    expect(registry.resolve('snapshot-1', sender)).toBeUndefined();
  });
});

describe('createReadingSenderScope', () => {
  it('prefers document identity and falls back to tab/frame or origin scope', () => {
    expect(createReadingSenderScope({
      documentId: 'document-1',
      tab: { id: 7 },
      frameId: 2,
    })).toBe('document:document-1');
    expect(createReadingSenderScope({
      tab: { id: 7 },
      frameId: 2,
    })).toBe('tab:7:frame:2');
    expect(createReadingSenderScope({
      url: 'chrome-extension://extension-id/dashboard.html',
    })).toBe('origin:chrome-extension://extension-id:frame:0');
  });
});
