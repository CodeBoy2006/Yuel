import { describe, expect, it, vi } from 'vitest';

import { PdfSourceError } from './errors';
import { createPdfResourceId, createPdfSha256 } from './hash';
import { loadLocalPdfSource, loadRemotePdfSource } from './load';
import type { LocalPdfFile, PdfSourceProgress } from './types';

const VALID_PDF_TEXT = '%PDF-1.7\n%%EOF\n';
const VALID_PDF_HASH = '1e7313ace78f0fb481a486939b4885902663102818090805515553d84e0bbfd3';

describe('PDF source loading', () => {
  it('loads a local PDF with a content-derived identity and explicit lifecycle', async () => {
    const progress: PdfSourceProgress[] = [];
    const file = createLocalFile(VALID_PDF_TEXT, '  /private/Reading Notes.pdf  ');

    const source = await loadLocalPdfSource(file, {
      maxBytes: 1_024,
      onProgress: (value) => progress.push(value),
    });

    expect(source.metadata).toEqual({
      resourceId: createPdfResourceId(VALID_PDF_HASH),
      sha256: VALID_PDF_HASH,
      kind: 'local',
      displayName: 'Reading Notes.pdf',
      byteLength: new TextEncoder().encode(VALID_PDF_TEXT).byteLength,
      mediaType: 'application/pdf',
    });
    expect(new TextDecoder().decode(source.getBuffer())).toBe(VALID_PDF_TEXT);
    expect(progress.map(({ stage }) => stage)).toEqual([
      'reading',
      'reading',
      'validating',
      'hashing',
      'ready',
    ]);

    source.release();
    expect(source.released).toBe(true);
    expect(() => source.getBuffer()).toThrow(PdfSourceError);
    try {
      source.getBuffer();
    } catch (error) {
      expect(error).toMatchObject({ code: 'released' });
    }
  });

  it('rejects an oversized local file before opening its stream', async () => {
    const file = createLocalFile(VALID_PDF_TEXT, 'large.pdf');
    const stream = vi.spyOn(file, 'stream');

    await expect(loadLocalPdfSource(file, { maxBytes: 4 })).rejects.toMatchObject({
      code: 'too-large',
      details: {
        actualBytes: new TextEncoder().encode(VALID_PDF_TEXT).byteLength,
        maxBytes: 4,
      },
    });
    expect(stream).not.toHaveBeenCalled();
  });

  it('distinguishes a local read failure from a remote network failure', async () => {
    const file: LocalPdfFile = {
      name: 'unreadable.pdf',
      size: 32,
      type: 'application/pdf',
      async arrayBuffer() {
        throw new Error('disk unavailable');
      },
    };

    await expect(loadLocalPdfSource(file, { maxBytes: 1_024 })).rejects.toMatchObject({
      code: 'read-error',
    });
  });

  it('streams a remote PDF with safe request defaults and download progress', async () => {
    const progress: PdfSourceProgress[] = [];
    const chunks = [
      new TextEncoder().encode('%PDF-1.7\n'),
      new TextEncoder().encode('%%EOF\n'),
    ];
    const chunkLengths = chunks.map((chunk) => chunk.byteLength);
    const response = createResponse(chunks, {
      url: 'https://cdn.example/books/Reading%20Notes.pdf',
      headers: {
        'Content-Length': String(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)),
        'Content-Type': 'application/pdf; charset=binary',
      },
    });
    const fetcher = vi.fn<typeof fetch>(async () => response);

    const source = await loadRemotePdfSource('https://example.com/download?id=1', {
      fetcher,
      maxBytes: 1_024,
      onProgress: (value) => progress.push(value),
    });

    expect(source.metadata).toEqual({
      resourceId: createPdfResourceId(VALID_PDF_HASH),
      sha256: VALID_PDF_HASH,
      kind: 'remote',
      displayName: 'Reading Notes.pdf',
      byteLength: new TextEncoder().encode(VALID_PDF_TEXT).byteLength,
      mediaType: 'application/pdf',
      origin: 'https://cdn.example',
      sourceUrl: 'https://example.com/download?id=1',
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [requestedUrl, request] = fetcher.mock.calls[0]!;
    expect(requestedUrl).toEqual(new URL('https://example.com/download?id=1'));
    expect(request).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
    });
    expect(new Headers(request?.headers).get('Accept')).toContain('application/pdf');
    expect(progress.filter(({ stage }) => stage === 'reading').map(({ loadedBytes }) => loadedBytes)).toEqual([
      0,
      chunkLengths[0],
      chunkLengths[0] + chunkLengths[1],
    ]);
  });

  it('rejects a declared oversized response before reading its body', async () => {
    let bodyAccessed = false;
    const response = createLazyBodyResponse([new TextEncoder().encode(VALID_PDF_TEXT)], {
      headers: { 'Content-Length': '4096' },
      onBodyAccess: () => {
        bodyAccessed = true;
      },
    });

    await expect(loadRemotePdfSource('https://example.com/large.pdf', {
      fetcher: async () => response,
      maxBytes: 1_024,
    })).rejects.toMatchObject({
      code: 'too-large',
      details: { actualBytes: 4_096, maxBytes: 1_024 },
    });
    expect(bodyAccessed).toBe(false);
  });

  it('enforces the hard limit when a response omits Content-Length', async () => {
    let cancelled = false;
    const response = createResponse([
      new TextEncoder().encode('%PDF-'),
      new Uint8Array(16),
    ], {
      keepOpen: true,
      onCancel: () => {
        cancelled = true;
      },
    });

    await expect(loadRemotePdfSource('https://example.com/unknown-size.pdf', {
      fetcher: async () => response,
      maxBytes: 8,
    })).rejects.toMatchObject({
      code: 'too-large',
      details: { actualBytes: 21, maxBytes: 8 },
    });
    expect(cancelled).toBe(true);
  });

  it('cancels an in-flight stream through AbortSignal', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode('%PDF-1.7\n'));
      },
      pull() {
        controller.abort();
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = createResponseFromStream(stream);

    await expect(loadRemotePdfSource('https://example.com/cancel.pdf', {
      fetcher: async () => response,
      maxBytes: 1_024,
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'aborted' });
    expect(cancelled).toBe(true);
  });

  it.each([
    ['not a URL', 'invalid-url'],
    ['file:///tmp/book.pdf', 'unsupported-protocol'],
    ['data:application/pdf;base64,JVBERg==', 'unsupported-protocol'],
  ])('rejects unsupported remote input %s before fetching', async (input, code) => {
    const fetcher = vi.fn();

    await expect(loadRemotePdfSource(input, {
      fetcher,
      maxBytes: 1_024,
    })).rejects.toMatchObject({ code });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a successful response that does not contain a PDF header', async () => {
    const response = createResponse([new TextEncoder().encode('<!doctype html>')]);

    await expect(loadRemotePdfSource('https://example.com/not-a-pdf', {
      fetcher: async () => response,
      maxBytes: 1_024,
    })).rejects.toMatchObject({ code: 'invalid-pdf' });
  });

  it('produces the expected SHA-256 digest', async () => {
    const buffer = new TextEncoder().encode(VALID_PDF_TEXT).buffer;
    await expect(createPdfSha256(buffer)).resolves.toBe(VALID_PDF_HASH);
    expect(() => createPdfResourceId('not-a-digest')).toThrow(RangeError);
  });
});

function createLocalFile(text: string, name: string): LocalPdfFile {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    type: 'application/pdf',
    async arrayBuffer() {
      return bytes.slice().buffer;
    },
    stream() {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  };
}

interface ResponseOptions {
  headers?: HeadersInit;
  keepOpen?: boolean;
  onBodyAccess?: () => void;
  onCancel?: () => void;
  url?: string;
}

function createResponse(chunks: Uint8Array[], options: ResponseOptions = {}): Response {
  const remainingChunks = [...chunks];
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = remainingChunks.shift();
      if (chunk) {
        controller.enqueue(chunk);
      } else if (!options.keepOpen) {
        controller.close();
      }
    },
    cancel() {
      options.onCancel?.();
    },
  });
  return createResponseFromStream(stream, options);
}

function createLazyBodyResponse(chunks: Uint8Array[], options: ResponseOptions): Response {
  const response = {
    ok: true,
    status: 200,
    url: options.url ?? 'https://example.com/document.pdf',
    headers: new Headers(options.headers),
    get body() {
      options.onBodyAccess?.();
      return createResponse(chunks, options).body;
    },
    arrayBuffer: async () => new Uint8Array(chunks.flatMap((chunk) => [...chunk])).buffer,
  };
  return response as Response;
}

function createResponseFromStream(stream: ReadableStream<Uint8Array>, options: ResponseOptions = {}): Response {
  const response = new Response(stream, {
    status: 200,
    headers: options.headers,
  });
  Object.defineProperty(response, 'url', {
    configurable: true,
    value: options.url ?? 'https://example.com/document.pdf',
  });
  return response;
}
