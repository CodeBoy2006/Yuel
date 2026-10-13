import type { BrowserPdfStreamInfo } from '../browserHandler';
import { PdfSourceError, isPdfSourceError } from './errors';
import { createPdfResourceId, createPdfSha256 } from './hash';
import type {
  LocalPdfFile,
  PdfSourceHandle,
  PdfSourceLoadOptions,
  PdfSourceMetadata,
  PdfSourceProgress,
  RemotePdfSourceLoadOptions,
} from './types';

const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const PDF_SIGNATURE_SCAN_BYTES = 1_024;
const INITIAL_STREAM_CAPACITY = 64 * 1_024;

export async function loadLocalPdfSource(
  file: LocalPdfFile,
  options: PdfSourceLoadOptions,
): Promise<PdfSourceHandle> {
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  throwIfAborted(options.signal);
  throwIfTooLarge(file.size, maxBytes);

  emitProgress(options.onProgress, {
    stage: 'reading',
    loadedBytes: 0,
    totalBytes: file.size,
  });
  const buffer = await readLocalFile(file, maxBytes, options);

  return finalizePdfSource(buffer, {
    kind: 'local',
    displayName: normalizeLocalDisplayName(file.name),
    mediaType: file.type || 'application/pdf',
  }, options);
}

export async function loadRemotePdfSource(
  input: string,
  options: RemotePdfSourceLoadOptions,
): Promise<PdfSourceHandle> {
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const requestedUrl = parseRemotePdfUrl(input);
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new PdfSourceError('network-error', 'Remote PDF loading is unavailable in this environment.');
  }

  throwIfAborted(options.signal);

  let response: Response;
  try {
    const headers = new Headers(options.request?.headers);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/pdf, application/octet-stream;q=0.9');
    }

    response = await fetcher(requestedUrl, {
      cache: 'no-store',
      credentials: options.request?.credentials ?? 'omit',
      headers,
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: options.signal,
    });
  } catch (error) {
    throw normalizeReadError(error, options.signal, 'network-error');
  }

  if (!response.ok) {
    throw new PdfSourceError('http-error', `Remote PDF request failed with HTTP ${response.status}.`, {
      status: response.status,
    });
  }

  const finalUrl = parseRemotePdfUrl(response.url || requestedUrl.toString());
  const buffer = await readPdfResponse(response, maxBytes, options);

  return finalizePdfSource(buffer, {
    kind: 'remote',
    displayName: createRemoteDisplayName(finalUrl),
    mediaType: response.headers.get('Content-Type')?.split(';', 1)[0]?.trim() || 'application/pdf',
    origin: finalUrl.origin,
    sourceUrl: requestedUrl.toString(),
  }, options);
}

export async function loadBrowserPdfSource(
  input: BrowserPdfStreamInfo,
  options: RemotePdfSourceLoadOptions,
): Promise<PdfSourceHandle> {
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const streamUrl = parseAbsoluteUrl(input.streamUrl, 'browser PDF stream');
  const originalUrl = parseBrowserPdfOriginalUrl(input.originalUrl);
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new PdfSourceError('network-error', 'Browser PDF stream loading is unavailable in this environment.');
  }

  throwIfAborted(options.signal);

  let response: Response;
  try {
    response = await fetcher(streamUrl, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: options.signal,
    });
  } catch (error) {
    throw normalizeReadError(error, options.signal, 'network-error');
  }

  if (!response.ok) {
    throw new PdfSourceError('http-error', `Browser PDF stream failed with HTTP ${response.status}.`, {
      status: response.status,
    });
  }

  const remote = originalUrl.protocol === 'http:' || originalUrl.protocol === 'https:';
  const buffer = await readPdfResponse(response, maxBytes, options);

  return finalizePdfSource(buffer, {
    kind: remote ? 'remote' : 'local',
    displayName: createRemoteDisplayName(originalUrl),
    mediaType: input.mimeType || 'application/pdf',
    ...(remote ? {
      origin: originalUrl.origin,
      sourceUrl: originalUrl.toString(),
    } : {}),
  }, options);
}

async function readPdfResponse(
  response: Response,
  maxBytes: number,
  options: PdfSourceLoadOptions,
): Promise<ArrayBuffer> {
  const contentLength = parseContentLength(response.headers.get('Content-Length'));
  if (contentLength !== undefined) {
    throwIfTooLarge(contentLength, maxBytes);
  }

  emitProgress(options.onProgress, {
    stage: 'reading',
    loadedBytes: 0,
    ...(contentLength === undefined ? {} : { totalBytes: contentLength }),
  });

  try {
    return response.body
      ? await readBoundedStream(response.body, contentLength, maxBytes, options)
      : await readBoundedBuffer(response, maxBytes, options);
  } catch (error) {
    throw normalizeReadError(error, options.signal, 'network-error');
  }
}

interface PdfSourceMetadataInput {
  kind: PdfSourceMetadata['kind'];
  displayName: string;
  mediaType: string;
  origin?: string;
  sourceUrl?: string;
}

async function finalizePdfSource(
  buffer: ArrayBuffer,
  metadata: PdfSourceMetadataInput,
  options: PdfSourceLoadOptions,
): Promise<PdfSourceHandle> {
  throwIfAborted(options.signal);
  emitProgress(options.onProgress, {
    stage: 'validating',
    loadedBytes: buffer.byteLength,
    totalBytes: buffer.byteLength,
  });
  assertPdfSignature(buffer);

  emitProgress(options.onProgress, {
    stage: 'hashing',
    loadedBytes: buffer.byteLength,
    totalBytes: buffer.byteLength,
  });
  const sha256 = await createPdfSha256(buffer);
  throwIfAborted(options.signal);

  const handle = createInMemoryPdfSourceHandle(buffer, {
    ...metadata,
    resourceId: createPdfResourceId(sha256),
    sha256,
    byteLength: buffer.byteLength,
  });
  emitProgress(options.onProgress, {
    stage: 'ready',
    loadedBytes: buffer.byteLength,
    totalBytes: buffer.byteLength,
  });
  return handle;
}

function createInMemoryPdfSourceHandle(
  initialBuffer: ArrayBuffer,
  metadata: PdfSourceMetadata,
): PdfSourceHandle {
  let buffer: ArrayBuffer | undefined = initialBuffer;
  const stableMetadata = Object.freeze({ ...metadata });

  return {
    metadata: stableMetadata,
    get released() {
      return buffer === undefined;
    },
    getBuffer() {
      if (!buffer) {
        throw new PdfSourceError('released', 'The PDF source buffer has already been released.');
      }
      return buffer;
    },
    release() {
      buffer = undefined;
    },
  };
}

async function readLocalFile(
  file: LocalPdfFile,
  maxBytes: number,
  options: PdfSourceLoadOptions,
): Promise<ArrayBuffer> {
  try {
    if (file.stream) {
      return await readBoundedStream(file.stream(), file.size, maxBytes, options);
    }

    return await readBoundedBuffer(file, maxBytes, options);
  } catch (error) {
    throw normalizeReadError(error, options.signal, 'read-error');
  }
}

async function readBoundedBuffer(
  source: { arrayBuffer(): Promise<ArrayBuffer> },
  maxBytes: number,
  options: PdfSourceLoadOptions,
): Promise<ArrayBuffer> {
  const buffer = await source.arrayBuffer();
  throwIfAborted(options.signal);
  throwIfTooLarge(buffer.byteLength, maxBytes);
  emitProgress(options.onProgress, {
    stage: 'reading',
    loadedBytes: buffer.byteLength,
    totalBytes: buffer.byteLength,
  });
  return buffer;
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  totalBytes: number | undefined,
  maxBytes: number,
  options: PdfSourceLoadOptions,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(getInitialCapacity(totalBytes, maxBytes));
  let length = 0;

  try {
    while (true) {
      throwIfAborted(options.signal);
      const result = await reader.read();
      if (result.done) break;
      if (result.value.byteLength === 0) continue;

      const nextLength = length + result.value.byteLength;
      throwIfTooLarge(nextLength, maxBytes);
      bytes = ensureCapacity(bytes, nextLength, maxBytes);
      bytes.set(result.value, length);
      length = nextLength;

      emitProgress(options.onProgress, {
        stage: 'reading',
        loadedBytes: length,
        ...(totalBytes === undefined ? {} : { totalBytes }),
      });
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (length === bytes.byteLength) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(0, length);
}

function getInitialCapacity(totalBytes: number | undefined, maxBytes: number): number {
  if (totalBytes !== undefined) return totalBytes;
  return Math.min(INITIAL_STREAM_CAPACITY, maxBytes);
}

function ensureCapacity(
  bytes: Uint8Array<ArrayBuffer>,
  requiredBytes: number,
  maxBytes: number,
): Uint8Array<ArrayBuffer> {
  if (bytes.byteLength >= requiredBytes) return bytes;

  const doubledCapacity = Math.max(1, bytes.byteLength * 2);
  const nextCapacity = Math.min(maxBytes, Math.max(requiredBytes, doubledCapacity));
  const nextBytes = new Uint8Array(nextCapacity);
  nextBytes.set(bytes);
  return nextBytes;
}

function assertPdfSignature(buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  const scanLength = Math.min(bytes.byteLength, PDF_SIGNATURE_SCAN_BYTES);

  for (let offset = 0; offset <= scanLength - PDF_SIGNATURE.byteLength; offset += 1) {
    if (PDF_SIGNATURE.every((byte, index) => bytes[offset + index] === byte)) {
      return;
    }
  }

  throw new PdfSourceError('invalid-pdf', 'The selected file does not contain a PDF header.');
}

function parseRemotePdfUrl(input: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new PdfSourceError('invalid-url', 'Enter a valid remote PDF URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PdfSourceError('unsupported-protocol', 'Remote PDFs must use HTTP or HTTPS.');
  }
  return parsed;
}

function parseBrowserPdfOriginalUrl(input: string): URL {
  const parsed = parseAbsoluteUrl(input, 'original PDF URL');
  if (
    parsed.protocol !== 'http:'
    && parsed.protocol !== 'https:'
    && parsed.protocol !== 'file:'
  ) {
    throw new PdfSourceError(
      'unsupported-protocol',
      'Browser PDF streams must originate from HTTP, HTTPS, or local files.',
    );
  }
  return parsed;
}

function parseAbsoluteUrl(input: string, label: string): URL {
  try {
    return new URL(input);
  } catch {
    throw new PdfSourceError('invalid-url', `Enter a valid ${label}.`);
  }
}

function parseContentLength(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : undefined;
}

function normalizeMaxBytes(maxBytes: number): number {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('PDF source maxBytes must be a positive safe integer.');
  }
  return maxBytes;
}

function throwIfTooLarge(actualBytes: number, maxBytes: number): void {
  if (actualBytes <= maxBytes) return;
  throw new PdfSourceError('too-large', 'The PDF exceeds the configured size limit.', {
    actualBytes,
    maxBytes,
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new PdfSourceError('aborted', 'PDF loading was cancelled.');
}

function normalizeReadError(
  error: unknown,
  signal: AbortSignal | undefined,
  fallbackCode: 'network-error' | 'read-error',
): PdfSourceError {
  if (isPdfSourceError(error)) return error;
  if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return new PdfSourceError('aborted', 'PDF loading was cancelled.');
  }
  return new PdfSourceError(
    fallbackCode,
    fallbackCode === 'network-error'
      ? 'The remote PDF could not be downloaded.'
      : 'The selected PDF could not be read.',
  );
}

function normalizeLocalDisplayName(name: string): string {
  const trimmedName = name.trim().split(/[/\\]/).pop()?.trim();
  return trimmedName || 'Untitled.pdf';
}

function createRemoteDisplayName(url: URL): string {
  const pathName = url.pathname.split('/').filter(Boolean).pop();
  if (!pathName) return 'Remote PDF';

  try {
    return decodeURIComponent(pathName) || 'Remote PDF';
  } catch {
    return pathName;
  }
}

function emitProgress(
  listener: PdfSourceLoadOptions['onProgress'],
  progress: PdfSourceProgress,
): void {
  listener?.(progress);
}
