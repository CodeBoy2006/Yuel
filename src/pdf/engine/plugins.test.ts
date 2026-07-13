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
      'zoom',
      'rotate',
      'render',
      'tiling',
    ]);
    expect(registrations[0]?.config).toMatchObject({
      maxDocuments: PDF_READER_RENDER_LIMITS.documentCount,
    });
    expect(registrations[2]?.config).toMatchObject({
      defaultBufferSize: PDF_READER_RENDER_LIMITS.pageBufferSize,
      defaultPageGap: PDF_READER_RENDER_LIMITS.pageGap,
      defaultStrategy: 'vertical',
    });
    expect(registrations[6]?.config).toMatchObject({
      tileSize: PDF_READER_RENDER_LIMITS.tileSize,
      overlapPx: PDF_READER_RENDER_LIMITS.tileOverlapPx,
      extraRings: PDF_READER_RENDER_LIMITS.tileExtraRings,
    });
  });

  it('returns new registration objects for isolated registries', () => {
    const first = createPdfReaderPlugins();
    const second = createPdfReaderPlugins();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });
});
