export type PdfSourceErrorCode =
  | 'aborted'
  | 'http-error'
  | 'invalid-pdf'
  | 'invalid-url'
  | 'network-error'
  | 'read-error'
  | 'released'
  | 'too-large'
  | 'unsupported-protocol';

export class PdfSourceError extends Error {
  constructor(
    public readonly code: PdfSourceErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, number | string>> = {},
  ) {
    super(message);
    this.name = 'PdfSourceError';
  }
}

export function isPdfSourceError(error: unknown): error is PdfSourceError {
  return error instanceof PdfSourceError;
}
