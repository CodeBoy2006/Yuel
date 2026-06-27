import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveSelectedTextItem } from './saveItems';

const mocks = vi.hoisted(() => {
  const savedItems = {
    put: vi.fn(),
  };

  return { savedItems };
});

vi.mock('./schema', () => ({
  db: {
    savedItems: mocks.savedItems,
  },
}));

const savedAt = Date.UTC(2026, 5, 28, 0, 20, 0);

describe('saveSelectedTextItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('ignores empty selected text', async () => {
    const record = await saveSelectedTextItem('   ', {
      sourceUrl: 'https://example.com/article',
      createdAt: savedAt,
    });

    expect(record).toBeUndefined();
    expect(mocks.savedItems.put).not.toHaveBeenCalled();
  });
});
