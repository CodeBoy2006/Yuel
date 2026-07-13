import {
  PdfTaskHelper,
  Rotation,
  type PdfDocumentObject,
  type PdfPageObject,
  type PdfPageTextRuns,
  type PdfTextRun,
  type Rect,
} from '@embedpdf/models';
import { describe, expect, it } from 'vitest';

import type { PdfSourceMetadata } from '../source';
import {
  extractPdfReadingSnapshot,
  type PdfTextRunsEngine,
} from './extract';
import {
  createPdfReadingPageId,
  createPdfReadingSectionId,
  createPdfReadingSnapshot,
  getPdfReadingDomain,
} from './identity';
import {
  combinePdfRotations,
  createPdfReadingTextSection,
  projectPdfReadingChunkRects,
} from './textModel';

const resourceId = `pdf_${'a'.repeat(64)}`;
const localMetadata: PdfSourceMetadata = {
  resourceId,
  sha256: 'a'.repeat(64),
  kind: 'local',
  displayName: 'Local architecture guide.pdf',
  byteLength: 4_096,
  mediaType: 'application/pdf',
};
const page: PdfPageObject = {
  index: 0,
  size: { width: 600, height: 800 },
  rotation: Rotation.Degree0,
  objectNumber: 42,
};

describe('PDF reading text model', () => {
  it('creates stable document, section, and chunk identities across text runs', () => {
    const pageId = createPdfReadingPageId(localMetadata);
    const textRuns = createTextRuns([
      createRun(
        'The first section explains stable local reading analytics across this PDF page.',
        { origin: { x: 60, y: 100 }, size: { width: 420, height: 18 } },
        0,
      ),
      createRun(
        'The second section preserves text coordinates while the reader changes zoom levels.',
        { origin: { x: 60, y: 130 }, size: { width: 430, height: 18 } },
        74,
      ),
    ]);

    const first = createPdfReadingTextSection({
      metadata: localMetadata,
      pageId,
      page,
      textRuns,
    });
    const second = createPdfReadingTextSection({
      metadata: localMetadata,
      pageId,
      page,
      textRuns,
    });

    expect(first.sectionId).toBe(createPdfReadingSectionId(resourceId, page));
    expect(first.wordCount).toBe(24);
    expect(first.chunks).toHaveLength(1);
    expect(first.chunks[0]).toMatchObject({
      pageId,
      sectionId: first.sectionId,
      pageIndex: 0,
      pageNumber: 1,
      selector: 'pdf-page(1)::segment(1)',
      sourceKey: `section(${first.sectionId})::segment(1)`,
      wordCount: 24,
      sentenceCount: 2,
    });
    expect(first.chunks[0].rects).toEqual([
      textRuns.runs[0].rect,
      textRuns.runs[1].rect,
    ]);
    expect(second.chunks[0].chunkId).toBe(first.chunks[0].chunkId);
    expect(second.chunks[0].textHash).toBe(first.chunks[0].textHash);
  });

  it('slices a long run into bounded chunk rectangles without changing page coordinates', () => {
    const text = Array.from({ length: 16 }, () => 'the alpha').join(' ');
    const rect: Rect = {
      origin: { x: 40, y: 200 },
      size: { width: 320, height: 20 },
    };
    const section = createPdfReadingTextSection({
      metadata: localMetadata,
      pageId: createPdfReadingPageId(localMetadata),
      page,
      textRuns: createTextRuns([createRun(text, rect, 0)]),
    });

    expect(section.chunks.map((chunk) => chunk.wordCount)).toEqual([16, 16]);
    expect(section.chunks[0].rects).toHaveLength(1);
    expect(section.chunks[1].rects).toHaveLength(1);
    expect(section.chunks[0].rects[0].origin.x).toBeCloseTo(40);
    expect(section.chunks[0].rects[0].size.width).toBeCloseTo(320 * (79 / 159));
    expect(section.chunks[1].rects[0].origin.x).toBeCloseTo(40 + 320 * (80 / 159));
    expect(section.chunks[1].rects[0].size.width).toBeCloseTo(320 * (79 / 159));
  });

  it('joins contiguous font runs inside one word without adding synthetic whitespace', () => {
    const section = createPdfReadingTextSection({
      metadata: localMetadata,
      pageId: createPdfReadingPageId(localMetadata),
      page,
      textRuns: createTextRuns([
        createRun(
          'Read',
          { origin: { x: 40, y: 200 }, size: { width: 30, height: 20 } },
          0,
        ),
        createRun(
          'ing analytics through the local PDF preserves stable metrics today.',
          { origin: { x: 70, y: 200 }, size: { width: 430, height: 20 } },
          4,
        ),
      ]),
    });

    expect(section.chunks).toHaveLength(1);
    expect(section.chunks[0].text).toBe(
      'Reading analytics through the local PDF preserves stable metrics today.',
    );
    expect(section.chunks[0].wordCount).toBe(10);
    expect(section.chunks[0].rects).toEqual([{
      origin: { x: 40, y: 200 },
      size: { width: 460, height: 20 },
    }]);
  });

  it('skips non-English PDF text while retaining the physical section', () => {
    const section = createPdfReadingTextSection({
      metadata: localMetadata,
      pageId: createPdfReadingPageId(localMetadata),
      page,
      textRuns: createTextRuns([
        createRun(
          '这篇文档介绍 React Vue Next TypeScript JavaScript API DOM CSS HTML 的使用场景。',
          { origin: { x: 40, y: 200 }, size: { width: 500, height: 20 } },
          0,
        ),
      ]),
    });

    expect(section.wordCount).toBe(0);
    expect(section.chunks).toEqual([]);
  });

  it('maps local and remote resources to one document-level reading aggregate', () => {
    const pageId = createPdfReadingPageId(localMetadata);
    const section = createPdfReadingTextSection({
      metadata: localMetadata,
      pageId,
      page,
      textRuns: createTextRuns([
        createRun(
          'The local PDF keeps reading analytics private and available without network storage.',
          { origin: { x: 40, y: 200 }, size: { width: 500, height: 20 } },
          0,
        ),
      ]),
    });
    const localSnapshot = createPdfReadingSnapshot(localMetadata, [section], 123);
    const remoteMetadata: PdfSourceMetadata = {
      ...localMetadata,
      kind: 'remote',
      origin: 'https://www.docs.example.com',
    };

    expect(getPdfReadingDomain(localMetadata)).toBe('pdf.local');
    expect(localSnapshot.page).toMatchObject({
      pageId,
      domain: 'pdf.local',
      resourceType: 'pdf',
      resourceId,
      totalWords: section.wordCount,
      capturedAt: 123,
    });
    expect(getPdfReadingDomain(remoteMetadata)).toBe('docs.example.com');
    expect(createPdfReadingPageId(remoteMetadata)).toMatch(/^docs\.example\.com_/);
  });

  it('combines intrinsic and reader rotation before projecting rects', () => {
    const projected = projectPdfReadingChunkRects(
      {
        rects: [{
          origin: { x: 100, y: 200 },
          size: { width: 50, height: 20 },
        }],
      },
      {
        size: page.size,
        rotation: Rotation.Degree90,
      },
      Rotation.Degree90,
      2,
    );

    expect(combinePdfRotations(Rotation.Degree90, Rotation.Degree90)).toBe(
      Rotation.Degree180,
    );
    expect(projected).toEqual([{
      origin: { x: 900, y: 1160 },
      size: { width: 100, height: 40 },
    }]);
  });
});

describe('extractPdfReadingSnapshot', () => {
  it('extracts pages sequentially and reports bounded progress', async () => {
    const secondPage: PdfPageObject = {
      ...page,
      index: 1,
      objectNumber: 43,
    };
    const document = createDocument([page, secondPage]);
    const calls: number[] = [];
    const progress: number[] = [];
    const engine: PdfTextRunsEngine = {
      getPageTextRuns: (_document, currentPage) => {
        calls.push(currentPage.index);
        return PdfTaskHelper.resolve(createTextRuns([
          createRun(
            `The PDF page ${currentPage.index + 1} explains local reading metrics with stable text coordinates.`,
            { origin: { x: 40, y: 200 }, size: { width: 500, height: 20 } },
            0,
          ),
        ]));
      },
    };

    const snapshot = await extractPdfReadingSnapshot(
      engine,
      document,
      localMetadata,
      {
        capturedAt: 456,
        onProgress: ({ completedPages }) => progress.push(completedPages),
      },
    );

    expect(calls).toEqual([0, 1]);
    expect(progress).toEqual([1, 2]);
    expect(snapshot.sections).toHaveLength(2);
    expect(snapshot.chunks).toHaveLength(2);
    expect(snapshot.page.totalWords).toBe(24);
    expect(snapshot.page.capturedAt).toBe(456);
  });

  it('aborts the active text-run task and does not continue to later pages', async () => {
    const controller = new AbortController();
    const pendingTask = PdfTaskHelper.create<PdfPageTextRuns>();
    const calls: number[] = [];
    const engine: PdfTextRunsEngine = {
      getPageTextRuns: (_document, currentPage) => {
        calls.push(currentPage.index);
        return pendingTask;
      },
    };
    const extraction = extractPdfReadingSnapshot(
      engine,
      createDocument([
        page,
        { ...page, index: 1, objectNumber: 43 },
      ]),
      localMetadata,
      { signal: controller.signal },
    );

    controller.abort();

    await expect(extraction).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toEqual([0]);
  });

  it('rejects metadata from a different PDF resource', async () => {
    const engine: PdfTextRunsEngine = {
      getPageTextRuns: () => PdfTaskHelper.resolve(createTextRuns([])),
    };

    await expect(extractPdfReadingSnapshot(
      engine,
      { ...createDocument([page]), id: `pdf_${'b'.repeat(64)}` },
      localMetadata,
    )).rejects.toThrow('must match the opened document ID');
  });
});

function createDocument(pages: PdfPageObject[]): PdfDocumentObject {
  return {
    id: resourceId,
    pageCount: pages.length,
    pages,
    isEncrypted: false,
    isOwnerUnlocked: true,
    permissions: 0,
    normalizedRotation: false,
  };
}

function createTextRuns(runs: PdfTextRun[]): PdfPageTextRuns {
  return { runs };
}

function createRun(text: string, rect: Rect, charIndex: number): PdfTextRun {
  return {
    text,
    rect,
    font: {
      name: 'TestFont',
      familyName: 'Test Font',
      weight: 400,
      italic: false,
      monospaced: false,
      embedded: true,
    },
    fontSize: 12,
    color: {
      red: 0,
      green: 0,
      blue: 0,
      alpha: 255,
    },
    charIndex,
    charCount: text.length,
  };
}
