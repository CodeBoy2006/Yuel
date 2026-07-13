import { createPluginRegistration } from '@embedpdf/core';
import type { PluginBatchRegistrations } from '@embedpdf/core';
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render';
import { RotatePluginPackage } from '@embedpdf/plugin-rotate';
import { SearchPluginPackage } from '@embedpdf/plugin-search';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail';
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
  selectionGeometryCache: 24,
  thumbnailBufferSize: 2,
  thumbnailWidth: 118,
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
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitWidth,
      minZoom: 0.25,
      maxZoom: 6,
      zoomStep: 0.1,
    }),
    createPluginRegistration(PanPluginPackage, {
      defaultMode: 'mobile',
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
    createPluginRegistration(SelectionPluginPackage, {
      marquee: { enabled: false },
      maxCachedGeometries: PDF_READER_RENDER_LIMITS.selectionGeometryCache,
      minSelectionDragDistance: 3,
      toleranceFactor: 1.25,
    }),
    createPluginRegistration(SearchPluginPackage, {
      flags: [],
      showAllResults: true,
    }),
    createPluginRegistration(ThumbnailPluginPackage, {
      width: PDF_READER_RENDER_LIMITS.thumbnailWidth,
      gap: 12,
      buffer: PDF_READER_RENDER_LIMITS.thumbnailBufferSize,
      labelHeight: 22,
      autoScroll: true,
      scrollBehavior: 'smooth',
      imagePadding: 0,
      paddingY: 14,
    }),
  ];
}

export const PDF_READER_PLUGINS = createPdfReaderPlugins();
