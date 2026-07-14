import { describe, expect, it } from 'vitest';

import {
  PDF_READER_RENDER_LIMITS,
  createPdfReaderPlugins,
} from './plugins';

describe('PDF reader engine configuration', () => {
  it('registers the bounded render stack in dependency order', () => {
    const registrations = createPdfReaderPlugins();

    expect(registrations.map((registration) => registration.package.manifest.id)).toEqual([
      'document-manager',
      'viewport',
      'scroll',
      'interaction-manager',
      'history',
      'zoom',
      'pan',
      'rotate',
      'render',
      'tiling',
      'selection',
      'annotation',
      'search',
      'thumbnail',
      'print',
      'export',
    ]);
    expect(registrations[0]?.config).toMatchObject({
      maxDocuments: PDF_READER_RENDER_LIMITS.documentCount,
    });
    expect(registrations[2]?.config).toMatchObject({
      defaultBufferSize: PDF_READER_RENDER_LIMITS.pageBufferSize,
      defaultPageGap: PDF_READER_RENDER_LIMITS.pageGap,
      defaultStrategy: 'vertical',
    });
    expect(registrations[9]?.config).toMatchObject({
      tileSize: PDF_READER_RENDER_LIMITS.tileSize,
      overlapPx: PDF_READER_RENDER_LIMITS.tileOverlapPx,
      extraRings: PDF_READER_RENDER_LIMITS.tileExtraRings,
    });
    expect(registrations[10]?.config).toMatchObject({
      marquee: { enabled: false },
      maxCachedGeometries: PDF_READER_RENDER_LIMITS.selectionGeometryCache,
    });
    expect(registrations[11]?.config).toMatchObject({
      autoCommit: false,
      autoOpenLinks: false,
      locked: { type: 'all' },
    });
    expect(registrations[13]?.config).toMatchObject({
      buffer: PDF_READER_RENDER_LIMITS.thumbnailBufferSize,
      width: PDF_READER_RENDER_LIMITS.thumbnailWidth,
    });
    expect(registrations[15]?.config).toMatchObject({
      defaultFileName: 'document.pdf',
    });
  });

  it('returns new registration objects for isolated registries', () => {
    const first = createPdfReaderPlugins();
    const second = createPdfReaderPlugins();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });
});
