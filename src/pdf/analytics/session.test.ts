import {
  Rotation,
  type PdfDocumentObject,
  type PdfPageObject,
} from '@embedpdf/models';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  ReadingSessionConfig,
  ReadingSessionController,
} from '../../analytics/readingSession';
import { createChunkId, hashText } from '../../domain/events';
import { createPdfReadingRuntimeModel } from './runtime';
import { startPdfReadingSessionBridge } from './session';
import type {
  PdfReadingSnapshot,
  PdfReadingTextChunk,
} from './types';

const mocks = vi.hoisted(() => {
  const controller = {
    collecting: true,
    flush: vi.fn(async () => true),
    markActivity: vi.fn(),
    recordScroll: vi.fn(),
    recordSelection: vi.fn(),
    resetScrollCoordinates: vi.fn(),
    setChunkVisibilities: vi.fn(),
    stop: vi.fn(),
  };

  return {
    controller,
    startReadingSession: vi.fn(
      (_config: ReadingSessionConfig): ReadingSessionController => controller,
    ),
  };
});

vi.mock('../../analytics/readingSession', async () => {
  const actual = await vi.importActual<
    typeof import('../../analytics/readingSession')
  >('../../analytics/readingSession');

  return {
    ...actual,
    startReadingSession: mocks.startReadingSession,
  };
});

class TestMutationObserver {
  static instances: TestMutationObserver[] = [];

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor(private readonly callback: MutationCallback) {
    TestMutationObserver.instances.push(this);
  }

  emit(): void {
    this.callback([], this as unknown as MutationObserver);
  }

  takeRecords(): MutationRecord[] {
    return [];
  }
}

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this);
  }

  emit(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const resourceId = `pdf_${'d'.repeat(64)}`;
const pdfPage: PdfPageObject = {
  index: 0,
  size: { width: 100, height: 200 },
  rotation: Rotation.Degree0,
  objectNumber: 11,
};
const pdfDocument: PdfDocumentObject = {
  id: resourceId,
  pageCount: 1,
  pages: [pdfPage],
  isEncrypted: false,
  isOwnerUnlocked: false,
  permissions: 0,
  normalizedRotation: false,
};

function createSnapshot(): PdfReadingSnapshot {
  const pageId = `pdf.local_${hashText(resourceId)}`;
  const text =
    'Stable PDF session bridges preserve viewport metrics across reader updates.';
  const sourceKey = 'section(test)::segment(1)';
  const chunk: PdfReadingTextChunk = {
    chunkId: createChunkId(pageId, text, sourceKey),
    pageId,
    sectionId: `${resourceId}_section_test`,
    textHash: hashText(text),
    text,
    sourceKey,
    wordCount: 10,
    sentenceCount: 1,
    selector: 'pdf-page(1)::segment(1)',
    pageIndex: 0,
    pageNumber: 1,
    rects: [{
      origin: { x: 10, y: 20 },
      size: { width: 40, height: 20 },
    }],
  };

  return {
    page: {
      pageId,
      domain: 'pdf.local',
      resourceType: 'pdf',
      resourceId,
      titleHash: hashText('Session test.pdf'),
      urlHash: hashText(resourceId),
      language: 'en',
      totalWords: chunk.wordCount,
      metricModelVersion: 2,
      capturedAt: 1,
    },
    sections: [{
      sectionId: chunk.sectionId,
      pageIndex: 0,
      pageNumber: 1,
      objectNumber: pdfPage.objectNumber,
      size: pdfPage.size,
      rotation: pdfPage.rotation,
      wordCount: chunk.wordCount,
      chunks: [chunk],
    }],
    chunks: [chunk],
  };
}

function bounds(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe('PDF reading session bridge', () => {
  const animationFrames = new Map<number, FrameRequestCallback>();
  let nextAnimationFrame = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    TestMutationObserver.instances = [];
    TestResizeObserver.instances = [];
    animationFrames.clear();
    nextAnimationFrame = 1;
    mocks.startReadingSession.mockReturnValue(mocks.controller);
    vi.stubGlobal('MutationObserver', TestMutationObserver);
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const frame = nextAnimationFrame;
      nextAnimationFrame += 1;
      animationFrames.set(frame, callback);
      return frame;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((frame: number) => {
      animationFrames.delete(frame);
    }));
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('adapts viewport lifecycle into one sparse PDF reading session', () => {
    const model = createPdfReadingRuntimeModel(createSnapshot(), pdfDocument);
    const viewport = document.createElement('div');
    const pageElement = document.createElement('div');
    pageElement.className = 'pdf-reader__page-shell';
    pageElement.dataset.pageNumber = '1';
    viewport.append(pageElement);
    document.body.append(viewport);

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, value: 120, writable: true },
    });
    const viewportRect = vi.spyOn(viewport, 'getBoundingClientRect')
      .mockReturnValue(bounds(0, 0, 300, 300));
    vi.spyOn(pageElement, 'getBoundingClientRect')
      .mockReturnValue(bounds(0, 0, 100, 200));

    let scale = 1;
    let rotation = Rotation.Degree0;
    const deliverBatch = vi.fn(async () => true);
    const bridge = startPdfReadingSessionBridge({
      model,
      viewportElement: viewport,
      getDocumentRotation: () => rotation,
      getScale: () => scale,
      deliverBatch,
    });

    const config = mocks.startReadingSession.mock.calls[0][0];
    expect(config).toEqual(expect.objectContaining({
      page: model.snapshot.page,
      chunks: model.eventChunks,
      batchChunkStrategy: 'referenced',
      deliverBatch,
    }));
    expect(config.getScrollMetrics?.()).toEqual({
      offsetPx: 120,
      scrollableExtentPx: 600,
    });

    flushAnimationFrames(animationFrames);
    expect(mocks.controller.setChunkVisibilities).toHaveBeenCalledWith([
      expect.objectContaining({
        chunkId: model.snapshot.chunks[0].chunkId,
        visible: true,
      }),
    ]);

    const measurementAtScaleOne = config.getChunkMeasurement(
      model.snapshot.chunks[0].chunkId,
    );
    scale = 2;
    const measurementAtScaleTwo = config.getChunkMeasurement(
      model.snapshot.chunks[0].chunkId,
    );
    expect(measurementAtScaleOne?.viewportY).not.toBe(
      measurementAtScaleTwo?.viewportY,
    );

    bridge.resetScrollCoordinates();
    expect(mocks.controller.resetScrollCoordinates).toHaveBeenCalledOnce();
    flushAnimationFrames(animationFrames);

    const previousLayoutReads = viewportRect.mock.calls.length;
    viewport.dispatchEvent(new Event('scroll'));
    expect(viewportRect.mock.calls.length).toBeGreaterThan(previousLayoutReads);
    expect(mocks.controller.recordScroll).toHaveBeenCalledOnce();

    pageElement.remove();
    TestMutationObserver.instances[0].emit();
    flushAnimationFrames(animationFrames);
    expect(mocks.controller.setChunkVisibilities).toHaveBeenLastCalledWith([
      {
        chunkId: model.snapshot.chunks[0].chunkId,
        visible: false,
        visibleRatio: 0,
      },
    ]);

    bridge.recordSelection('selected PDF text');
    expect(mocks.controller.recordSelection).toHaveBeenCalledWith(
      'selected PDF text',
    );

    bridge.stop();
    expect(TestMutationObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(TestResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(mocks.controller.stop).toHaveBeenCalledOnce();

    viewport.dispatchEvent(new Event('scroll'));
    expect(mocks.controller.recordScroll).toHaveBeenCalledOnce();
  });
});

function flushAnimationFrames(
  animationFrames: Map<number, FrameRequestCallback>,
): void {
  const callbacks = Array.from(animationFrames.values());
  animationFrames.clear();
  for (const callback of callbacks) {
    callback(0);
  }
}
