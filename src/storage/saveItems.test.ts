import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveSelectedTextItem } from './saveItems';

const mocks = vi.hoisted(() => {
  const savedItems = {
    put: vi.fn(),
  };
  const vocabExposures = {
    get: vi.fn(),
    put: vi.fn(),
  };
  const db = {
    savedItems,
    vocabExposures,
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === 'function') {
        await callback();
      }
    }),
  };

  return { db, savedItems, vocabExposures };
});

vi.mock('./schema', () => ({
  db: mocks.db,
}));

const savedAt = Date.UTC(2026, 5, 28, 0, 20, 0);

describe('saveSelectedTextItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.vocabExposures.get.mockResolvedValue(undefined);
  });

  it('stores intentionally selected text as a local saved item', async () => {
    const record = await saveSelectedTextItem('  fail gracefully under pressure  ', {
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      createdAt: savedAt,
    });

    expect(mocks.savedItems.put).toHaveBeenCalledWith(record);
    expect(record).toMatchObject({
      text: 'fail gracefully under pressure',
      type: 'phrase',
      sourceDomain: 'developer.mozilla.org',
      tags: ['selection'],
      createdAt: savedAt,
    });
    expect(record?.id).toMatch(/^saved_/);
  });

  it('creates vocabulary memory for intentionally saved trackable words', async () => {
    await saveSelectedTextItem('  Resilience  ', {
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      createdAt: savedAt,
    });

    expect(mocks.vocabExposures.get).toHaveBeenCalledWith('resilience');
    expect(mocks.vocabExposures.put).toHaveBeenCalledWith({
      lemma: 'resilience',
      language: 'en',
      seenCount: 0,
      effectiveSeenCount: 0,
      lookupCount: 0,
      savedCount: 1,
      lastSeenAt: savedAt,
      packTags: [],
      userStatus: 'learning',
    });
  });

  it('re-activates ignored vocabulary when the user explicitly saves it', async () => {
    mocks.vocabExposures.get.mockResolvedValueOnce({
      lemma: 'resilience',
      language: 'en',
      seenCount: 3,
      effectiveSeenCount: 0,
      lookupCount: 0,
      savedCount: 1,
      lastSeenAt: savedAt - 1_000,
      packTags: [],
      userStatus: 'ignored',
    });

    await saveSelectedTextItem('Resilience', {
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      createdAt: savedAt,
    });

    expect(mocks.vocabExposures.put).toHaveBeenCalledWith({
      lemma: 'resilience',
      language: 'en',
      seenCount: 3,
      effectiveSeenCount: 0,
      lookupCount: 0,
      savedCount: 2,
      lastSeenAt: savedAt,
      packTags: [],
      userStatus: 'learning',
    });
  });

  it('ignores empty selected text', async () => {
    const record = await saveSelectedTextItem('   ', {
      sourceUrl: 'https://example.com/article',
      createdAt: savedAt,
    });

    expect(record).toBeUndefined();
    expect(mocks.savedItems.put).not.toHaveBeenCalled();
  });
});
