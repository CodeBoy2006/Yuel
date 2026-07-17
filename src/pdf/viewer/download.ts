export const PDF_DOWNLOAD_MIME_TYPE = 'application/pdf';

interface PdfDownloadEnvironment {
  createLink?: () => HTMLAnchorElement;
  createObjectUrl?: (file: File) => string;
  revokeObjectUrl?: (url: string) => void;
  scheduleRevoke?: (callback: () => void) => void;
}

export function normalizePdfDownloadFileName(
  suggestedName: string | undefined,
): string {
  const baseName = suggestedName
    ?.trim()
    .split(/[/\\]/)
    .pop()
    ?.trim() ?? '';
  if (/\.pdf$/i.test(baseName)) return baseName;

  const stem = baseName.replace(/[.\s]+$/u, '') || 'document';
  return `${stem}.pdf`;
}

function createPdfDownloadFile(
  buffer: ArrayBuffer,
  suggestedName: string | undefined,
): File {
  return new File(
    [buffer],
    normalizePdfDownloadFileName(suggestedName),
    { type: PDF_DOWNLOAD_MIME_TYPE },
  );
}

export function downloadPdfBuffer(
  buffer: ArrayBuffer,
  suggestedName: string | undefined,
  {
    createLink = () => document.createElement('a'),
    createObjectUrl = (file) => URL.createObjectURL(file),
    revokeObjectUrl = (url) => URL.revokeObjectURL(url),
    scheduleRevoke = (callback) => {
      window.setTimeout(callback, 0);
    },
  }: PdfDownloadEnvironment = {},
): File {
  const file = createPdfDownloadFile(buffer, suggestedName);
  const url = createObjectUrl(file);

  try {
    const link = createLink();
    link.download = file.name;
    link.href = url;
    link.rel = 'noopener';
    link.click();
  } finally {
    scheduleRevoke(() => revokeObjectUrl(url));
  }

  return file;
}
