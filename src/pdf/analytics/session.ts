import type { Rotation } from '@embedpdf/models';

import {
  startReadingSession,
  type ReadingSessionController,
} from '../../analytics/readingSession';
import {
  deliverReadingEventBatch,
  type ReadingEventBatchDelivery,
} from '../../messaging/readingEventsClient';
import {
  capturePdfReadingLayout,
  collectPdfReadingVisibility,
  measurePdfReadingChunk,
  type PdfReadingLayoutSnapshot,
  type PdfReadingRuntimeModel,
} from './runtime';

export interface PdfReadingSessionBridge {
  recordSelection: (text: string) => void;
  resetScrollCoordinates: () => void;
  stop: () => void;
}

export interface PdfReadingSessionBridgeOptions {
  model: PdfReadingRuntimeModel;
  viewportElement: HTMLElement;
  getDocumentRotation: () => Rotation;
  getScale: () => number;
  deliverBatch?: ReadingEventBatchDelivery;
}

export function startPdfReadingSessionBridge({
  model,
  viewportElement,
  getDocumentRotation,
  getScale,
  deliverBatch = deliverReadingEventBatch,
}: PdfReadingSessionBridgeOptions): PdfReadingSessionBridge {
  let latestLayout = capturePdfReadingLayout(viewportElement);
  let trackedChunkIds = new Set<string>();
  let animationFrame: number | undefined;
  let stopped = false;

  const readVisibility = () => {
    latestLayout = capturePdfReadingLayout(viewportElement);
    const result = collectPdfReadingVisibility(
      model,
      getDocumentRotation(),
      getScale(),
      latestLayout,
      trackedChunkIds,
    );
    trackedChunkIds = result.trackedChunkIds;
    return result.updates;
  };

  let session: ReadingSessionController;
  const scanVisibility = () => {
    animationFrame = undefined;
    if (stopped) {
      return;
    }

    session.setChunkVisibilities(readVisibility());
  };
  const refreshLayout = () => {
    if (stopped || animationFrame !== undefined) {
      return;
    }

    animationFrame = window.requestAnimationFrame(scanVisibility);
  };

  session = startReadingSession({
    page: model.snapshot.page,
    chunks: model.eventChunks,
    batchChunkStrategy: 'referenced',
    deliverBatch,
    getChunkMeasurement: (chunkId) => measurePdfReadingChunk(
      model,
      chunkId,
      getDocumentRotation(),
      getScale(),
      latestLayout,
    ),
    getRestorableChunkVisibilities: () => readVisibility()
      .filter((update) => update.visible),
    getScrollMetrics: () => ({
      offsetPx: viewportElement.scrollTop,
      scrollableExtentPx: Math.max(
        1,
        viewportElement.scrollHeight - viewportElement.clientHeight,
      ),
    }),
  });

  const onScroll = () => {
    latestLayout = capturePdfReadingLayout(viewportElement);
    session.recordScroll();
    refreshLayout();
  };
  viewportElement.addEventListener('scroll', onScroll, { passive: true });

  const resetScrollCoordinates = () => {
    if (stopped) {
      return;
    }

    session.resetScrollCoordinates();
    refreshLayout();
  };
  const mutationObserver = new MutationObserver(refreshLayout);
  mutationObserver.observe(viewportElement, {
    childList: true,
    subtree: true,
  });

  const resizeObserver = new ResizeObserver(refreshLayout);
  resizeObserver.observe(viewportElement);
  refreshLayout();

  return {
    recordSelection: (text) => session.recordSelection(text),
    resetScrollCoordinates,
    stop: () => {
      if (stopped) {
        return;
      }

      stopped = true;
      viewportElement.removeEventListener('scroll', onScroll);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
      session.stop();
    },
  };
}
