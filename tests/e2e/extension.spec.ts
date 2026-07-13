import {
  expect,
  openExtensionPage,
  readActiveTabCollectorStatus,
  readExtensionPageText,
  readReadingToolbarActionState,
  sendExtensionRuntimeMessage,
  test,
} from './helpers/extension';
import { createRuntimeReadingBatchMessage, RUNTIME_LOOP_DOMAIN } from './helpers/reading';
import { READING_SITE_HOST, withReadingSite } from './helpers/readingSite';
import { createPdfSmokeFixture } from './helpers/pdf';

test('loads the packaged extension pages', async ({ context, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);

  const dashboard = await openExtensionPage(context, extensionId, 'dashboard.html');
  await expect(dashboard.locator('body')).toContainText('阅读输入仪表盘');
  await dashboard.close();

  const popup = await openExtensionPage(context, extensionId, 'popup.html');
  await expect(popup.locator('body')).toContainText('阅量 Yuel');
  const popupReaderPagePromise = context.waitForEvent('page');
  await popup.getByRole('button', { name: '打开 PDF 阅读器' }).click();
  const popupReaderPage = await popupReaderPagePromise;
  await popupReaderPage.waitForLoadState('load');
  await expect(popupReaderPage.locator('body')).toContainText('打开 PDF，继续你的阅读');
  await popupReaderPage.close();
  await popup.close();

  const sidePanel = await openExtensionPage(context, extensionId, 'sidepanel.html');
  await expect(sidePanel.locator('body')).toContainText('当前阅读');
  const sidePanelReaderPagePromise = context.waitForEvent('page');
  await sidePanel.getByRole('button', { name: '打开 PDF 阅读器' }).click();
  const sidePanelReaderPage = await sidePanelReaderPagePromise;
  await sidePanelReaderPage.waitForLoadState('load');
  await expect(sidePanelReaderPage.locator('body')).toContainText('打开 PDF，继续你的阅读');
  await sidePanelReaderPage.close();
  await sidePanel.close();

  const pdfReader = await openExtensionPage(context, extensionId, 'pdf-reader.html');
  await expect(pdfReader.locator('body')).toContainText('打开 PDF，继续你的阅读');
  await pdfReader.close();
});

test('renders a local PDF through packaged PDFium WASM and workers without remote requests', async ({
  context,
  extensionId,
}) => {
  const pdfReader = await openExtensionPage(context, extensionId, 'pdf-reader.html');
  const externalRequests: string[] = [];
  const pageErrors: string[] = [];

  pdfReader.on('request', (request) => {
    const url = request.url();
    if (
      !url.startsWith(`chrome-extension://${extensionId}/`)
      && !url.startsWith('blob:chrome-extension://')
      && !url.startsWith('data:')
    ) {
      externalRequests.push(url);
    }
  });
  pdfReader.on('pageerror', (error) => pageErrors.push(error.message));

  const openFileButton = pdfReader.getByRole('button', { name: '打开文件' });
  await expect(openFileButton).toBeEnabled();
  await pdfReader.locator('input[type="file"]').setInputFiles({
    name: 'yuel-reader-smoke.pdf',
    mimeType: 'application/pdf',
    buffer: createPdfSmokeFixture(),
  });

  const renderedPage = pdfReader.locator('.pdf-reader__page-shell').first();
  const renderedImage = pdfReader.locator('.pdf-reader__base-page').first();
  await expect(renderedPage).toBeVisible();
  await expect(renderedImage).toBeVisible();
  await expect(pdfReader.locator('.pdf-reader__document-name')).toContainText(
    'yuel-reader-smoke.pdf',
  );

  await expect.poll(() => pdfReader.workers().length).toBeGreaterThanOrEqual(1);
  expect(pdfReader.workers().every((worker) => worker.url().startsWith('blob:'))).toBe(true);

  const pixelEvidence = await renderedImage.evaluate((image) => {
    if (!(image instanceof HTMLImageElement)) {
      throw new Error('Rendered PDF layer is not an image');
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || canvas.width === 0 || canvas.height === 0) {
      return { height: canvas.height, nonWhitePixels: 0, width: canvas.width };
    }

    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhitePixels = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) {
        nonWhitePixels += 1;
      }
    }

    return {
      height: canvas.height,
      nonWhitePixels,
      width: canvas.width,
    };
  });

  expect(pixelEvidence.width).toBeGreaterThan(100);
  expect(pixelEvidence.height).toBeGreaterThan(100);
  expect(pixelEvidence.nonWhitePixels).toBeGreaterThan(20);

  const thumbnailPanelButton = pdfReader.getByRole('button', {
    name: '切换缩略图面板',
  });
  await thumbnailPanelButton.click();
  await expect(thumbnailPanelButton).toHaveAttribute('aria-pressed', 'true');
  await expect(pdfReader.locator('.pdf-reader__sidebar')).toBeVisible();
  const firstPageThumbnail = pdfReader.getByRole('button', {
    name: '前往第 1 页',
  });
  const secondPageThumbnail = pdfReader.getByRole('button', {
    name: '前往第 2 页',
  });
  await expect(firstPageThumbnail).toBeVisible();
  await expect(secondPageThumbnail).toBeVisible();
  await expect(firstPageThumbnail.locator('img')).toBeVisible();
  await expect(secondPageThumbnail.locator('img')).toBeVisible();
  const toolbarPageInput = pdfReader.locator(
    '.pdf-reader__document-tools .pdf-reader__page-control input',
  );
  await secondPageThumbnail.click();
  await expect.poll(() => toolbarPageInput.inputValue()).toBe('2');
  await firstPageThumbnail.click();
  await expect.poll(() => toolbarPageInput.inputValue()).toBe('1');

  await pdfReader.getByRole('tab', { name: '搜索' }).click();
  const searchInput = pdfReader.getByRole('searchbox', {
    name: '搜索 PDF 内容',
  });
  await expect(searchInput).toBeFocused();
  await searchInput.fill('Local PDFium');
  await expect(pdfReader.locator('.pdf-reader__search-summary')).toContainText(
    '1 个结果',
  );
  const searchResult = pdfReader.locator('.pdf-reader__search-result').first();
  await expect(searchResult).toContainText('Local PDFium');
  await searchResult.click();

  const activeHighlight = pdfReader.locator('.pdf-reader__search-layer > div').first();
  await expect(activeHighlight).toBeVisible();

  const panButton = pdfReader.getByRole('button', { name: '切换拖拽浏览' });
  await expect(panButton).toHaveAttribute('aria-pressed', 'false');
  await panButton.click();
  await expect(panButton).toHaveAttribute('aria-pressed', 'true');
  await panButton.click();
  await expect(panButton).toHaveAttribute('aria-pressed', 'false');

  const highlightBox = await activeHighlight.boundingBox();
  expect(highlightBox).not.toBeNull();
  if (!highlightBox) throw new Error('Search highlight has no browser geometry');
  const selectionY = highlightBox.y + highlightBox.height / 2;
  await pdfReader.mouse.move(highlightBox.x + 2, selectionY);
  await pdfReader.mouse.down();
  await pdfReader.mouse.move(
    highlightBox.x + Math.max(4, highlightBox.width - 2),
    selectionY,
    { steps: 8 },
  );
  await pdfReader.mouse.up();

  const copySelectionButton = pdfReader.getByRole('button', {
    name: '复制所选文本',
  });
  await expect(copySelectionButton).toBeVisible();
  await copySelectionButton.click();
  await expect(copySelectionButton).toContainText('已复制');

  await pdfReader.getByRole('button', { name: '关闭导航面板' }).first().click();
  await expect(pdfReader.locator('.pdf-reader__sidebar')).toBeHidden();
  await pdfReader.locator('body').press('Control+f');
  await expect(pdfReader.locator('.pdf-reader__sidebar')).toBeVisible();
  await expect(searchInput).toBeFocused();

  const zoomInput = pdfReader.locator('.pdf-reader__zoom-input input');
  const zoomBeforeRotation = Number(await zoomInput.inputValue());
  const rotateButton = pdfReader.getByRole('button', { name: '顺时针旋转' });
  await rotateButton.click();
  await expect(rotateButton).toHaveAttribute('title', /当前 90°/);
  await expect(renderedPage).toBeVisible();
  await expect.poll(async () => Number(await zoomInput.inputValue())).not.toBe(zoomBeforeRotation);

  const zoomInButton = pdfReader.getByRole('button', { name: '放大' }).first();
  const initialZoom = Number(await zoomInput.inputValue());
  await zoomInButton.click();
  await expect.poll(async () => Number(await zoomInput.inputValue())).toBeGreaterThan(initialZoom);

  await pdfReader.setViewportSize({ width: 620, height: 900 });
  const sidebar = pdfReader.locator('.pdf-reader__sidebar');
  const sidebarBackdrop = pdfReader.locator('.pdf-reader__sidebar-backdrop');
  await expect(sidebar).toBeVisible();
  await expect(sidebarBackdrop).toBeVisible();
  const sidebarBox = await sidebar.boundingBox();
  const documentStageBox = await pdfReader.locator('.pdf-reader__document-stage').boundingBox();
  expect(sidebarBox?.width).toBeLessThanOrEqual(280);
  expect(sidebarBox?.x).toBe(0);
  expect(documentStageBox?.width).toBe(620);
  await sidebarBackdrop.click({ position: { x: 600, y: 400 } });
  await expect(sidebar).toBeHidden();

  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  await pdfReader.close();
});

test('records reading data through the extension runtime', async ({ context, extensionId }) => {
  const messagePage = await openExtensionPage(context, extensionId, 'dashboard.html');
  await sendExtensionRuntimeMessage(messagePage, createRuntimeReadingBatchMessage());
  await messagePage.close();

  const dashboard = await openExtensionPage(context, extensionId, 'dashboard.html');
  const dashboardBody = dashboard.locator('body');
  await expect(dashboardBody).toContainText(RUNTIME_LOOP_DOMAIN);
  await expect(dashboardBody).toContainText('今日有效阅读');
  await expect(dashboardBody).not.toContainText('从下一篇外语文章开始');
});

test('updates the toolbar logo through completion and supports static mode', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  await expect.poll(() => readReadingToolbarActionState(extensionWorker)).toEqual({
    title: 'Yuel Reading · 今日 0 / 500 词',
    badgeText: '',
  });

  const dashboard = await openExtensionPage(context, extensionId, 'dashboard.html');
  await dashboard.getByRole('button', { name: '调整目标' }).click();
  await dashboard.locator('#daily-check-in-threshold').fill('1');
  await dashboard.getByRole('button', { name: '保存目标' }).click();
  await expect(dashboard.locator('.check-in-setting__value')).toContainText('1 词 / 天');

  await sendExtensionRuntimeMessage(dashboard, createRuntimeReadingBatchMessage());

  await expect.poll(() => readReadingToolbarActionState(extensionWorker)).toMatchObject({
    title: expect.stringContaining('Yuel Reading · 今日已达标'),
    badgeText: '✓',
  });

  const progressIconToggle = dashboard.locator('#reading-toolbar-progress-enabled');
  await expect(progressIconToggle).toBeChecked();
  await progressIconToggle.uncheck();
  await expect.poll(() => readReadingToolbarActionState(extensionWorker)).toEqual({
    title: 'Yuel Reading',
    badgeText: '',
  });

  await dashboard.reload({ waitUntil: 'load' });
  await expect(progressIconToggle).not.toBeChecked();
});

test('records reading on an arbitrary HTTPS site and reports the live collector state', async ({ context, extensionId, extensionWorker }) => {
  await withReadingSite(async (readingSiteUrl) => {
    const readingPage = await context.newPage();
    await readingPage.goto(readingSiteUrl, { waitUntil: 'load' });
    await expect(readingPage.locator('body')).toContainText('All-site content script reading loop');
    await expect.poll(() => readActiveTabCollectorStatus(extensionWorker)).toMatchObject({
      collecting: true,
      url: readingSiteUrl,
    });

    const dashboard = await openExtensionPage(context, extensionId, 'dashboard.html');
    const globalRecordingToggle = dashboard.locator('#reading-recording-enabled');
    await expect(globalRecordingToggle).toBeChecked();
    await globalRecordingToggle.uncheck();
    await readingPage.bringToFront();
    await expect.poll(() => readActiveTabCollectorStatus(extensionWorker)).toMatchObject({
      collecting: false,
      url: readingSiteUrl,
    });

    await dashboard.bringToFront();
    await globalRecordingToggle.check();
    await readingPage.bringToFront();
    await expect.poll(() => readActiveTabCollectorStatus(extensionWorker)).toMatchObject({
      collecting: true,
      url: readingSiteUrl,
    });
    await dashboard.close();

    // Hiding the page flushes the current batch. Let one viewport sample
    // complete first so the flushed batch contains effective reading evidence.
    await readingPage.waitForTimeout(1_250);

    let dashboardText = '';
    await expect.poll(async () => {
      dashboardText = await readExtensionPageText(context, extensionId, 'dashboard.html');
      return dashboardText;
    }).toContain(READING_SITE_HOST);
    expect(dashboardText).not.toContain('从下一篇外语文章开始');

    const sidePanel = await openExtensionPage(context, extensionId, 'sidepanel.html');
    await readingPage.bringToFront();
    const sidePanelBody = sidePanel.locator('body');
    await expect(sidePanelBody).toContainText(READING_SITE_HOST);
    await expect(sidePanelBody).toContainText('记录中');
    await expect(sidePanelBody).not.toContainText('不可记录');
  });
});
