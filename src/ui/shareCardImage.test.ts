import { describe, expect, it, vi } from 'vitest';

import { exportSummaryCardPng } from './shareCardImage';

describe('exportSummaryCardPng', () => {
  it('renders a summary-card element to PNG and downloads it', async () => {
    const element = document.createElement('section');
    const dataUrl = 'data:image/png;base64,card';
    const renderToPng = vi.fn(async () => dataUrl);
    const downloadDataUrl = vi.fn();

    const result = await exportSummaryCardPng(element, {
      downloadDataUrl,
      filename: 'yuel-reading-2026-06-27.png',
      renderToPng,
    });

    expect(result).toBe(dataUrl);
    expect(renderToPng).toHaveBeenCalledWith(
      element,
      expect.objectContaining({
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 2,
      }),
    );
    expect(downloadDataUrl).toHaveBeenCalledWith(dataUrl, 'yuel-reading-2026-06-27.png');
  });
});
