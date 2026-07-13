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
      'zoom',
      'pan',
      'rotate',
      'render',
      'tiling',
      'selection',
      'search',
      'thumbnail',
    ]);
    expect(registrations[0]?.config).toMatchObject({
      maxDocuments: PDF_READER_RENDER_LIMITS.documentCount,
    });
    expect(registrations[2]?.config).toMatchObject({
      defaultBufferSize: PDF_READER_RENDER_LIMITS.pageBufferSize,
      defaultPageGap: PDF_READER_RENDER_LIMITS.pageGap,
      defaultStrategy: 'vertical',
    });
    expect(registrations[8]?.config).toMatchObject({
      tileSize: PDF_READER_RENDER_LIMITS.tileSize,
      overlapPx: PDF_READER_RENDER_LIMITS.tileOverlapPx,
      extraRings: PDF_READER_RENDER_LIMITS.tileExtraRings,
    });
    expect(registrations[9]?.config).toMatchObject({
      marquee: { enabled: false },
      maxCachedGeometries: PDF_READER_RENDER_LIMITS.selectionGeometryCache,
    });
    expect(registrations[11]?.config).toMatchObject({
      buffer: PDF_READER_RENDER_LIMITS.thumbnailBufferSize,
      width: PDF_READER_RENDER_LIMITS.thumbnailWidth,
    });
  });

  it('returns new registration objects for isolated registries', () => {
    const first = createPdfReaderPlugins();
    const second = createPdfReaderPlugins();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });
});
