import { expect, openExtensionPage, test } from './helpers/extension';
import { createPdfFixture } from './helpers/pdf';

test('finishes PDF analytics and keeps navigation responsive with dense reference URLs', async ({
  context,
  extensionId,
}) => {
  // The reference on page 23 of arXiv:2604.26962 triggered endless rebalancing.
  const reference = 'URL https://proceedings.neurips.cc/paper_files/paper/2023/hash/d842425e4bf79ba039352da0f658a906-Abstrac t-Conference.html.';
  const buffer = createPdfFixture([
    `BT /F1 6 Tf 20 720 Td (${reference}) Tj ET\n`,
    'BT /F1 12 Tf 72 720 Td (The next page remains readable after processing the reference link.) Tj ET\n',
  ]);
  const reader = await openExtensionPage(context, extensionId, 'pdf-reader.html');
  const pageErrors: string[] = [];
  reader.on('pageerror', (error) => pageErrors.push(error.message));
  await expect(reader.getByRole('button', { name: '打开文件' })).toBeEnabled();
  await reader.locator('input[type="file"]').setInputFiles({
    name: 'dense-reference.pdf',
    mimeType: 'application/pdf',
    buffer,
  });

  await reader.getByRole('button', { name: '打开阅读地图' }).click();
  await expect(reader.getByRole('progressbar', { name: '全文阅读覆盖' })).toBeVisible();
  await expect(reader.locator('.pdf-reader__sidebar')).toHaveCSS('width', '300px');
  const pageInput = reader.locator('.pdf-reader__document-tools .pdf-reader__page-control input');
  await pageInput.fill('2');
  await pageInput.press('Enter');
  await expect(reader.locator('.pdf-reader__page-shell[data-page-number="2"]')).toBeVisible();
  await expect(reader.locator('.pdf-reader__page-shell[data-page-number="2"] .pdf-reader__base-page'))
    .toHaveJSProperty('naturalWidth', 612);
  expect(pageErrors).toEqual([]);
  await reader.close();
});
