import { toPng } from 'html-to-image';

interface ShareCardImageOptions {
  downloadDataUrl?: (dataUrl: string, filename: string) => void;
  filename?: string;
  renderToPng?: (element: HTMLElement, options: ShareCardRenderOptions) => Promise<string>;
}

interface ShareCardRenderOptions {
  backgroundColor: string;
  cacheBust: boolean;
  pixelRatio: number;
}

export async function exportSummaryCardPng(
  element: HTMLElement,
  {
    downloadDataUrl = downloadBrowserDataUrl,
    filename = 'yuel-reading-summary.png',
    renderToPng = toPng,
  }: ShareCardImageOptions = {},
): Promise<string> {
  const dataUrl = await renderToPng(element, {
    backgroundColor: '#ffffff',
    cacheBust: true,
    pixelRatio: 2,
  });

  downloadDataUrl(dataUrl, filename);
  return dataUrl;
}

function downloadBrowserDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.rel = 'noopener';
  link.click();
}
