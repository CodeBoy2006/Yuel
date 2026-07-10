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
    renderToPng = renderToPngLazily,
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

async function renderToPngLazily(element: HTMLElement, options: ShareCardRenderOptions): Promise<string> {
  const { toPng } = await import('html-to-image');
  return toPng(element, options);
}

function downloadBrowserDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.rel = 'noopener';
  link.click();
}
