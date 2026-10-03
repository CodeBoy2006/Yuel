import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedItemRecord } from './schema';

import {
  deleteSavedItem,
  savePdfSelectedTextItem,
  saveSelectedTextItem,
  updatePdfHighlight,
  updateSavedItemMetadata,
} from './saveItems';

const mocks = vi.hoisted(() => {
  const savedItems = {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const pdfAnnotations = {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const vocabExposures = {
    delete: vi.fn(),
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
        return callback();
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
    mocks.savedItems.get.mockResolvedValue(undefined);
    mocks.pdfAnnotations.get.mockResolvedValue(undefined);
    mocks.vocabExposures.get.mockResolvedValue(undefined);
  });

  it('stores intentionally selected text as a local saved item', async () => {
    const record = await saveSelectedTextItem('  fail gracefully under pressure  ', {
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      sourceTitle: '  Web API reference  ',
      createdAt: savedAt,
    });

    expect(mocks.savedItems.put).toHaveBeenCalledWith(record);
    expect(record).toMatchObject({
      text: 'fail gracefully under pressure',
      type: 'phrase',
      sourceDomain: 'developer.mozilla.org',
      sourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/API',
      sourceTitle: 'Web API reference',
      tags: ['selection'],
      vocabularyTracked: true,
      createdAt: savedAt,
      updatedAt: savedAt,
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

  it('does not turn every word in a long excerpt into vocabulary memory', async () => {
    const text = Array.from(
      { length: 30 },
      (_, index) => `evidence${index} remains connected to its source`,
    ).join(' ');

    const record = await saveSelectedTextItem(text, {
      sourceUrl: 'https://example.com/article',
      createdAt: savedAt,
    });

    expect(record).toMatchObject({
      type: 'quote',
      vocabularyTracked: false,
    });
    expect(mocks.vocabExposures.get).not.toHaveBeenCalled();
    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
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
      sourceUrl: 'https://docs.example.com/reference.pdf',
      sourceTitle: 'Reference.pdf',
      tags: ['selection', 'pdf'],
      vocabularyTracked: true,
      createdAt: savedAt,
      updatedAt: savedAt,
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

  it('stores a colored PDF highlight with local note and tags', async () => {
    const resourceId = `pdf_${'c'.repeat(64)}`;
    const record = await savePdfSelectedTextItem('  Durable local highlight  ', {
      metadata: {
        resourceId,
        sha256: 'c'.repeat(64),
        kind: 'local',
        displayName: 'Notes.pdf',
        byteLength: 3_072,
        mediaType: 'application/pdf',
      },
      sourceRects: [{
        pageIndex: 1,
        x: 48,
        y: 96,
        width: 220,
        height: 16,
      }],
      highlightColor: 'green',
      note: '  Revisit before implementation.  ',
      userTags: [' Architecture ', 'review'],
      createdAt: savedAt,
    });

    expect(record).toMatchObject({
      text: 'Durable local highlight',
      tags: ['selection', 'pdf', 'highlight'],
      note: 'Revisit before implementation.',
      userTags: ['Architecture', 'review'],
    });
    expect(mocks.pdfAnnotations.put).toHaveBeenCalledWith(expect.objectContaining({
      id: record?.pdfAnnotationId,
      resourceId,
      type: 'highlight',
      color: 'green',
    }));
  });

  it('updates only user-managed note and tags', async () => {
    mocks.savedItems.get.mockResolvedValueOnce({
      id: 'saved-note',
      text: 'fail gracefully',
      type: 'phrase',
      sourceDomain: 'example.com',
      tags: ['selection'],
      createdAt: savedAt,
    });

    const record = await updateSavedItemMetadata('saved-note', {
      note: '  Reuse this in the retry design.\r\nKeep the failure state visible.  ',
      userTags: [' Architecture ', 'reliability', 'architecture', ''],
    }, savedAt + 1_000);

    expect(record).toEqual({
      id: 'saved-note',
      text: 'fail gracefully',
      type: 'phrase',
      sourceDomain: 'example.com',
      tags: ['selection'],
      note: 'Reuse this in the retry design.\nKeep the failure state visible.',
      userTags: ['Architecture', 'reliability'],
      createdAt: savedAt,
      updatedAt: savedAt + 1_000,
    });
    expect(mocks.savedItems.put).toHaveBeenCalledWith(record);
  });

  it('promotes a legacy PDF excerpt while updating color and metadata in one transaction', async () => {
    const savedItem = {
      id: 'saved-highlight',
      text: 'Durable local highlight',
      type: 'sentence' as const,
      sourceDomain: 'pdf.local',
      tags: ['selection', 'pdf'],
      pdfAnnotationId: 'pdf_annotation_saved-highlight',
      createdAt: savedAt,
      updatedAt: savedAt,
    };
    const annotation = {
      id: 'pdf_annotation_saved-highlight',
      resourceId: `pdf_${'d'.repeat(64)}`,
      pageIndex: 1,
      type: 'excerpt' as const,
      quote: savedItem.text,
      textHash: 'hash',
      sourceRects: [{
        pageIndex: 1,
        x: 48,
        y: 96,
        width: 220,
        height: 16,
      }],
      createdAt: savedAt,
      updatedAt: savedAt,
    };
    mocks.savedItems.get.mockResolvedValueOnce(savedItem);
    mocks.pdfAnnotations.get.mockResolvedValueOnce(annotation);

    const updated = await updatePdfHighlight(savedItem.id, {
      color: 'blue',
      note: '  Keep beside the architecture notes.  ',
      userTags: ['design', 'Review'],
    }, savedAt + 2_000);

    expect(updated).toEqual({
      annotation: {
        ...annotation,
        type: 'highlight',
        color: 'blue',
        updatedAt: savedAt + 2_000,
      },
      savedItem: {
        ...savedItem,
        tags: ['selection', 'pdf', 'highlight'],
        note: 'Keep beside the architecture notes.',
        userTags: ['design', 'Review'],
        updatedAt: savedAt + 2_000,
      },
    });
    expect(mocks.db.transaction).toHaveBeenCalledWith(
      'rw',
      [mocks.savedItems, mocks.pdfAnnotations],
      expect.any(Function),
    );
    expect(mocks.pdfAnnotations.put).toHaveBeenCalledWith(updated?.annotation);
    expect(mocks.savedItems.put).toHaveBeenCalledWith(updated?.savedItem);
  });

  it('deletes a saved PDF item, its anchor, and its vocabulary count', async () => {
    mocks.savedItems.get.mockResolvedValueOnce({
      id: 'saved-pdf',
      text: 'Local PDFium',
      type: 'phrase',
      sourceDomain: 'pdf.local',
      tags: ['selection', 'pdf'],
      pdfAnnotationId: 'pdf_annotation_saved-pdf',
      vocabularyTracked: true,
      createdAt: savedAt,
    });
    mocks.vocabExposures.get.mockImplementation(async (lemma: string) => ({
      lemma,
      language: 'en',
      seenCount: 2,
      effectiveSeenCount: 1,
      savedCount: 2,
      lastSeenAt: savedAt,
      packTags: [],
      userStatus: 'learning',
    }));

    await expect(deleteSavedItem('saved-pdf')).resolves.toBe(true);

    expect(mocks.savedItems.delete).toHaveBeenCalledWith('saved-pdf');
    expect(mocks.pdfAnnotations.delete).toHaveBeenCalledWith('pdf_annotation_saved-pdf');
    expect(mocks.vocabExposures.put).toHaveBeenCalledWith(expect.objectContaining({
      savedCount: 1,
    }));
  });

  it('removes vocabulary created only by the deleted saved item', async () => {
    mocks.savedItems.get.mockResolvedValueOnce({
      id: 'saved-word',
      text: 'resilience',
      type: 'word',
      sourceDomain: 'example.com',
      tags: ['selection'],
      vocabularyTracked: true,
      createdAt: savedAt,
    });
    mocks.vocabExposures.get.mockResolvedValueOnce({
      lemma: 'resilience',
      language: 'en',
      seenCount: 0,
      effectiveSeenCount: 0,
      savedCount: 1,
      lastSeenAt: savedAt,
      packTags: [],
      userStatus: 'learning',
    });

    await deleteSavedItem('saved-word');

    expect(mocks.vocabExposures.delete).toHaveBeenCalledWith('resilience');
    expect(mocks.vocabExposures.put).not.toHaveBeenCalled();
  });
});

describe('saved item transaction ordering', () => {
  let records: Map<string, SavedItemRecord>;

  beforeEach(() => {
    vi.clearAllMocks();
    records = new Map(['first', 'second'].map((id) => [id, {
      id,
      text: 'resilience',
      type: 'word',
      sourceDomain: 'example.com',
      tags: ['selection'],
      vocabularyTracked: true,
      createdAt: savedAt,
    }]));
    mocks.savedItems.get.mockImplementation(async (id: string) => records.get(id));
    mocks.savedItems.put.mockImplementation(async (record: SavedItemRecord) => { records.set(record.id, record); });
    mocks.savedItems.delete.mockImplementation(async (id: string) => { records.delete(id); });
    mocks.vocabExposures.get.mockResolvedValue({
      lemma: 'resilience', savedCount: 2, seenCount: 1, effectiveSeenCount: 1, packTags: [], userStatus: 'learning',
    });

    // Model the serialization of read/write transactions sharing the saved-item table.
    let tail = Promise.resolve();
    mocks.db.transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1) as () => Promise<unknown>;
      const transaction = tail.then(callback);
      tail = transaction.then(() => undefined, () => undefined);
      return transaction;
    });
  });

  it('does not restore an item when a queued clear runs before its metadata update', async () => {
    const clear = mocks.db.transaction('rw', [mocks.savedItems], async () => { records.clear(); });
    const update = updateSavedItemMetadata('first', { note: 'Late edit', userTags: [] });

    await clear;
    await expect(update).resolves.toBeUndefined();
    expect(records.size).toBe(0);
    expect(mocks.savedItems.put).not.toHaveBeenCalled();
  });

  it('deducts vocabulary only once when two deletes target the same saved item', async () => {
    const results = await Promise.all([deleteSavedItem('first'), deleteSavedItem('first')]);

    expect(results).toEqual([true, false]);
    expect(records.has('first')).toBe(false);
    expect(records.has('second')).toBe(true);
    expect(mocks.vocabExposures.put).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ savedCount: 1 }));
  });
});
