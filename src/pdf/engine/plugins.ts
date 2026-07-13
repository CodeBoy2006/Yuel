import { createPluginRegistration } from '@embedpdf/core';
import type { PluginBatchRegistrations } from '@embedpdf/core';
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager';
import { RenderPluginPackage } from '@embedpdf/plugin-render';
import { RotatePluginPackage } from '@embedpdf/plugin-rotate';
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll';
import { TilingPluginPackage } from '@embedpdf/plugin-tiling';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport';
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom';

export const PDF_READER_RENDER_LIMITS = Object.freeze({
  documentCount: 1,
  pageBufferSize: 1,
  pageGap: 24,
  tileSize: 768,
  tileOverlapPx: 2.5,
  tileExtraRings: 0,
});

export function createPdfReaderPlugins(): PluginBatchRegistrations {
  return [
    createPluginRegistration(DocumentManagerPluginPackage, {
      maxDocuments: PDF_READER_RENDER_LIMITS.documentCount,
    }),
    createPluginRegistration(ViewportPluginPackage, {
      viewportGap: 0,
      scrollEndDelay: 240,
    }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultStrategy: ScrollStrategy.Vertical,
      defaultPageGap: PDF_READER_RENDER_LIMITS.pageGap,
      defaultBufferSize: PDF_READER_RENDER_LIMITS.pageBufferSize,
    }),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitWidth,
      minZoom: 0.25,
      maxZoom: 6,
      zoomStep: 0.1,
    }),
    createPluginRegistration(RotatePluginPackage),
    createPluginRegistration(RenderPluginPackage, {
      withAnnotations: false,
      withForms: false,
      defaultImageType: 'image/png',
    }),
    createPluginRegistration(TilingPluginPackage, {
      tileSize: PDF_READER_RENDER_LIMITS.tileSize,
      overlapPx: PDF_READER_RENDER_LIMITS.tileOverlapPx,
      extraRings: PDF_READER_RENDER_LIMITS.tileExtraRings,
      defaultImageType: 'image/png',
    }),
  ];
}

export const PDF_READER_PLUGINS = createPdfReaderPlugins();
