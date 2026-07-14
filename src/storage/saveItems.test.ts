import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  savePdfSelectedTextItem,
  saveSelectedTextItem,
} from './saveItems';

const mocks = vi.hoisted(() => {
  const savedItems = {
    put: vi.fn(),
  };
  const pdfAnnotations = {
    put: vi.fn(),
  };
  const vocabExposures = {
    get: vi.fn(),
    put: vi.fn(),
  };
  const db = {
    pdfAnnotations,
    savedItems,
    vocabExposures,
    transaction: vi.fn(async (...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback === 'function') {
        await callback();
      }
    }),
  };

  return { db, pdfAnnotations, savedItems, vocabExposures };
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

  it('generates unique records for repeated saves of the same text in the same millisecond', async () => {
    const first = await saveSelectedTextItem('resilience', {
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      createdAt: savedAt,
    });
    const second = await saveSelectedTextItem('resilience', {
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      createdAt: savedAt,
    });

    expect(first?.id).not.toBe(second?.id);
    expect(mocks.savedItems.put).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: first?.id }));
    expect(mocks.savedItems.put).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: second?.id }));
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
      savedCount: 2,
      lastSeenAt: savedAt,
      packTags: [],
      userStatus: 'learning',
    });
  });

  it('does not move vocabulary lastSeenAt backwards when saving older selected text', async () => {
    mocks.vocabExposures.get.mockResolvedValueOnce({
      lemma: 'resilience',
      language: 'en',
      seenCount: 3,
      effectiveSeenCount: 2,
      savedCount: 1,
      lastSeenAt: savedAt + 1_000,
      packTags: ['architecture'],
      userStatus: 'known',
    });

    await saveSelectedTextItem('Resilience', {
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      createdAt: savedAt,
    });

    expect(mocks.vocabExposures.put).toHaveBeenCalledWith({
      lemma: 'resilience',
      language: 'en',
      seenCount: 3,
      effectiveSeenCount: 2,
      savedCount: 2,
      lastSeenAt: savedAt + 1_000,
      packTags: ['architecture'],
      userStatus: 'known',
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

  it('stores a PDF excerpt as an annotation-backed saved item', async () => {
    const resourceId = `pdf_${'a'.repeat(64)}`;
    const record = await savePdfSelectedTextItem('  Local PDFium WASM  ', {
      metadata: {
        resourceId,
        sha256: 'a'.repeat(64),
        kind: 'remote',
        displayName: 'Reference.pdf',
        byteLength: 2_048,
        mediaType: 'application/pdf',
        origin: 'https://docs.example.com',
        sourceUrl: 'https://docs.example.com/reference.pdf',
      },
      sourceRects: [
        {
          pageIndex: 2,
          x: 72,
          y: 140,
          width: 180,
          height: 18,
        },
      ],
      createdAt: savedAt,
    });

    expect(record).toMatchObject({
      text: 'Local PDFium WASM',
      sourceDomain: 'docs.example.com',
      tags: ['selection', 'pdf'],
      createdAt: savedAt,
    });
    expect(record?.pdfAnnotationId).toMatch(/^pdf_annotation_saved_/);
    expect(mocks.pdfAnnotations.put).toHaveBeenCalledWith({
      id: record?.pdfAnnotationId,
      resourceId,
      pageIndex: 2,
      type: 'excerpt',
      quote: 'Local PDFium WASM',
      textHash: expect.any(String),
      sourceRects: [{
        pageIndex: 2,
        x: 72,
        y: 140,
        width: 180,
        height: 18,
      }],
      createdAt: savedAt,
      updatedAt: savedAt,
    });
    expect(mocks.savedItems.put).toHaveBeenCalledWith(record);
  });

  it('rejects PDF selection saves without a valid source rectangle', async () => {
    await expect(savePdfSelectedTextItem('Source text', {
      metadata: {
        resourceId: `pdf_${'b'.repeat(64)}`,
        sha256: 'b'.repeat(64),
        kind: 'local',
        displayName: 'Local.pdf',
        byteLength: 1_024,
        mediaType: 'application/pdf',
      },
      sourceRects: [],
      createdAt: savedAt,
    })).rejects.toThrow(RangeError);

    expect(mocks.pdfAnnotations.put).not.toHaveBeenCalled();
    expect(mocks.savedItems.put).not.toHaveBeenCalled();
  });
});
