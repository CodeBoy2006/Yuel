import type { Page } from '@playwright/test';

import { expect, openExtensionPage, test } from './helpers/extension';
import { createPdfFixture } from './helpers/pdf';

const PRIMARY_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

test('exposes PDF text at the native context-menu hit point and clears stale ranges', async ({
  context,
  extensionId,
}) => {
  const reader = await openExtensionPage(context, extensionId, 'pdf-reader.html');
  await expect(reader.getByRole('button', { name: '打开文件' })).toBeEnabled();
  await reader.locator('input[type="file"]').setInputFiles({
    name: 'native-selection.pdf',
    mimeType: 'application/pdf',
    buffer: createPdfFixture([
      'BT /F1 14 Tf 72 720 Td (First native selection line) Tj 0 -30 Td (Second native selection line) Tj ET\n',
      'BT /F1 14 Tf 72 720 Td (Text on the second page) Tj ET\n',
    ]),
  });
  const page = reader.locator('.pdf-reader__page-shell[data-page-number="1"]');
  await expect(page.locator('.pdf-reader__base-page')).toHaveJSProperty('naturalWidth', 612);
  await reader.evaluate(() => {
    document.addEventListener('contextmenu', (event) => {
      // Sample during dispatch, before the default action builds Chrome's menu.
      // Reading getSelection().toString() alone misses offscreen-range failures.
      const selection = window.getSelection();
      const hit = document.caretRangeFromPoint(event.clientX, event.clientY);
      const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
      document.documentElement.dataset.nativeContext = JSON.stringify({
        text: selection?.toString() ?? '',
        hit: Boolean(hit && range?.isPointInRange(hit.startContainer, hit.startOffset)),
        prevented: event.defaultPrevented,
      });
    });
  });

  await reader.keyboard.press(`${PRIMARY_MODIFIER}+A`);
  const allMarks = page.locator('.pdf-reader__select-all-mark');
  await expect(allMarks).toHaveCount(2);
  const first = await allMarks.nth(0).boundingBox();
  const second = await allMarks.nth(1).boundingBox();
  if (!first || !second) throw new Error('Missing PDF selection geometry');
  const firstPoint = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
  await reader.keyboard.down('Control');
  await reader.mouse.click(firstPoint.x, firstPoint.y);
  await reader.keyboard.up('Control');
  await expect(allMarks).toHaveCount(2);
  await expect.poll(async () => (await rightClick(reader, firstPoint)).text)
    .toContain('Text on the second page');
  expect(await readContext(reader)).toMatchObject({ hit: true, prevented: false });
  await reader.keyboard.press('Escape');
  await expect(allMarks).toHaveCount(0);
  expect(await reader.evaluate(() => window.getSelection()?.toString())).toBe('');

  await reader.mouse.move(first.x + 1, firstPoint.y);
  await reader.mouse.down();
  await reader.mouse.move(second.x + second.width - 1, second.y + second.height / 2, { steps: 12 });
  await reader.mouse.up();
  await expect(reader.getByRole('button', { name: '打开划词伴读' })).toBeEnabled();
  await expect.poll(async () => (await rightClick(reader, firstPoint)).text)
    .toContain('First native selection line');
  expect(await readContext(reader)).toMatchObject({ hit: true, prevented: false });
  expect((await readContext(reader)).text).toContain('Second native selection line');
  expect((await readContext(reader)).text).not.toContain('Text on the second page');
  expect(await reader.evaluate(() => {
    const clipboardData = new DataTransfer();
    const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData });
    document.dispatchEvent(event);
    return { text: clipboardData.getData('text/plain'), types: clipboardData.types };
  })).toEqual({ text: (await readContext(reader)).text, types: ['text/plain'] });
  await reader.keyboard.press('Escape');

  const zoom = reader.locator('.pdf-reader__zoom-input input');
  await zoom.fill('150');
  await zoom.press('Enter');
  await reader.getByRole('button', { name: '顺时针旋转' }).click();
  const selectionMark = page.locator('.pdf-reader__text-selection-layer > div > div').first();
  await expect(selectionMark).toBeVisible();
  const rotated = await selectionMark.boundingBox();
  if (!rotated) throw new Error('Missing rotated PDF selection geometry');
  await expect.poll(async () => (await rightClick(reader, {
    x: rotated.x + rotated.width / 2,
    y: rotated.y + rotated.height / 2,
  })).text).toContain('First native selection line');
  expect(await readContext(reader)).toMatchObject({ hit: true, prevented: false });

  const bounds = await page.boundingBox();
  if (!bounds) throw new Error('Missing page bounds');
  const blank = { x: bounds.x + 20, y: bounds.y + 20 };
  expect(await rightClick(reader, blank)).toMatchObject({ text: '', prevented: false });
  await reader.keyboard.press('Escape');
  await reader.mouse.click(blank.x, blank.y);
  await expect(reader.getByRole('button', { name: '复制所选文本' })).toHaveCount(0);
  expect(await reader.evaluate(() => window.getSelection()?.toString())).toBe('');
  expect(await rightClick(reader, firstPoint)).toMatchObject({ text: '', prevented: false });
  await reader.close();
});

async function rightClick(reader: Page, point: { x: number; y: number }) {
  await reader.mouse.click(point.x, point.y, { button: 'right' });
  return readContext(reader);
}

async function readContext(reader: Page): Promise<{ text: string; hit: boolean; prevented: boolean }> {
  return reader.evaluate(() => JSON.parse(document.documentElement.dataset.nativeContext ?? '{}'));
}
