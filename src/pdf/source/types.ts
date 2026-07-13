export type PdfSourceKind = 'local' | 'remote';
export type PdfSourceLoadStage = 'reading' | 'validating' | 'hashing' | 'ready';

export interface PdfSourceProgress {
  stage: PdfSourceLoadStage;
  loadedBytes: number;
  totalBytes?: number;
}

export interface PdfSourceMetadata {
  readonly resourceId: string;
  readonly sha256: string;
  readonly kind: PdfSourceKind;
  readonly displayName: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly origin?: string;
}

export interface PdfSourceHandle {
  readonly metadata: PdfSourceMetadata;
  readonly released: boolean;
  getBuffer(): ArrayBuffer;
  release(): void;
}

export interface PdfSourceLoadOptions {
  maxBytes: number;
  signal?: AbortSignal;
  onProgress?: (progress: PdfSourceProgress) => void;
}

export interface RemotePdfRequestOptions {
  credentials?: RequestCredentials;
  headers?: HeadersInit;
}

export interface RemotePdfSourceLoadOptions extends PdfSourceLoadOptions {
  fetcher?: typeof fetch;
  request?: RemotePdfRequestOptions;
}

export interface LocalPdfFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  stream?(): ReadableStream<Uint8Array>;
}
