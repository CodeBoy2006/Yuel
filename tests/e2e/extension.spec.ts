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

test('renders a local PDF through packaged PDFium WASM and records analytics without remote requests', async ({
  context,
  extensionId,
}) => {
  const pdfReader = await openExtensionPage(context, extensionId, 'pdf-reader.html');
  const pdfFixture = createPdfSmokeFixture();
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
    buffer: pdfFixture,
  });

  const renderedPage = pdfReader.locator('.pdf-reader__page-shell').first();
  const renderedImage = pdfReader.locator('.pdf-reader__base-page').first();
  await expect(renderedPage).toBeVisible();
  await expect(renderedImage).toBeVisible();
  await expect(pdfReader.locator('.pdf-reader__document-name')).toContainText(
    'yuel-reader-smoke.pdf',
  );
  const toolbarPageInput = pdfReader.locator(
    '.pdf-reader__document-tools .pdf-reader__page-control input',
  );
  const printButton = pdfReader.getByRole('button', { name: '打印 PDF' });
  const downloadButton = pdfReader.getByRole('button', { name: '下载 PDF' });
  await expect(printButton).toBeEnabled();
  await expect(downloadButton).toBeEnabled();

  const internalLink = pdfReader.locator(
    '.pdf-reader__annotation-layer [style*="cursor: pointer"]',
  ).first();
  await expect(internalLink).toBeVisible();
  await internalLink.click();
  await expect.poll(() => toolbarPageInput.inputValue()).toBe('2');
  await toolbarPageInput.fill('1');
  await toolbarPageInput.press('Enter');
  await expect.poll(() => toolbarPageInput.inputValue()).toBe('1');

  const downloadPromise = pdfReader.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('yuel-reader-smoke.pdf');

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

  const navigationPanelButton = pdfReader.getByRole('button', {
    name: '切换目录与缩略图面板',
  });
  await navigationPanelButton.click();
  await expect(navigationPanelButton).toHaveAttribute('aria-pressed', 'true');
  await expect(pdfReader.locator('.pdf-reader__sidebar')).toBeVisible();
  await expect(pdfReader.getByRole('tab', { name: '目录' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const outlineNavigation = pdfReader.getByRole('navigation', {
    name: 'PDF 章节目录',
  });
  await expect(outlineNavigation).toBeVisible();
  const introductionOutline = outlineNavigation.getByRole('button', {
    name: /Introduction/,
  });
  const pageTwoOutline = outlineNavigation.getByRole('button', {
    name: /Page two/,
  });
  const nestedOutline = outlineNavigation
    .locator('.pdf-reader__outline-list .pdf-reader__outline-list')
    .getByRole('button', { name: /Local rendering/ });
  await expect(introductionOutline).toBeVisible();
  await expect(pageTwoOutline).toBeVisible();
  await expect(nestedOutline).toBeVisible();
  await pageTwoOutline.click();
  await expect.poll(() => toolbarPageInput.inputValue()).toBe('2');
  await introductionOutline.click();
  await expect.poll(() => toolbarPageInput.inputValue()).toBe('1');

  await pdfReader.getByRole('tab', { name: '缩略图' }).click();
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
  const readerViewport = pdfReader.locator('.pdf-reader__viewport');
  await expect.poll(() => readerViewport.evaluate((element) => element.scrollTop)).toBe(0);

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
  const saveSelectionButton = pdfReader.getByRole('button', {
    name: '保存所选文本到 Yuel',
  });
  await saveSelectionButton.click();
  await expect(saveSelectionButton).toContainText('已保存');

  const excerptDashboard = await openExtensionPage(
    context,
    extensionId,
    'dashboard.html',
  );
  await expect.poll(async () => {
    await excerptDashboard.reload({ waitUntil: 'load' });
    return excerptDashboard.locator('body').innerText();
  }).toContain('Local PDFium');
  const backlinkPagePromise = context.waitForEvent('page');
  await excerptDashboard.getByRole('button', {
    name: '第 1 页 · 跳回原文',
  }).click();
  const backlinkReader = await backlinkPagePromise;
  await backlinkReader.waitForLoadState('load');
  await expect(backlinkReader.locator('body')).toContainText(
    '重新选择 yuel-reader-smoke.pdf',
  );
  await backlinkReader.locator('input[type="file"]').setInputFiles({
    name: 'yuel-reader-smoke.pdf',
    mimeType: 'application/pdf',
    buffer: pdfFixture,
  });
  await expect(backlinkReader.locator('.pdf-reader__document-name')).toContainText(
    'yuel-reader-smoke.pdf',
  );
  await expect.poll(() => backlinkReader.locator(
    '.pdf-reader__document-tools .pdf-reader__page-control input',
  ).inputValue()).toBe('1');
  await expect(backlinkReader.locator(
    '.pdf-reader__backlink-highlight',
  ).first()).toBeVisible();
  await backlinkReader.close();
  await excerptDashboard.close();
  await pdfReader.bringToFront();

  await pdfReader.getByRole('button', { name: '关闭导航面板' }).first().click();
  await expect(pdfReader.locator('.pdf-reader__sidebar')).toBeHidden();
  await pdfReader.locator('body').press('Control+f');
  await expect(pdfReader.locator('.pdf-reader__sidebar')).toBeVisible();
  await expect(searchInput).toBeFocused();

  const zoomInput = pdfReader.locator('.pdf-reader__zoom-input input');
  const zoomBeforeRotation = Number(await zoomInput.inputValue());
  const rotateButton = pdfReader.getByRole('button', { name: '顺时针旋转' });
  const preRotationScrollTop = await readerViewport.evaluate((element) => {
    element.scrollTop = Math.min(
      260,
      Math.max(0, element.scrollHeight - element.clientHeight),
    );
    element.dispatchEvent(new Event('scroll'));
    return element.scrollTop;
  });
  expect(preRotationScrollTop).toBeGreaterThan(40);
  await pdfReader.waitForTimeout(80);
  await rotateButton.click();
  await expect(rotateButton).toHaveAttribute('title', /当前 90°/);
  await expect(renderedPage).toBeVisible();
  await expect.poll(async () => Number(await zoomInput.inputValue())).not.toBe(zoomBeforeRotation);
  await pdfReader.waitForTimeout(420);
  const rotatedPosition = await readVisiblePdfPosition(pdfReader);

  await pdfReader.reload({ waitUntil: 'load' });
  const resumeDocument = pdfReader.locator('.pdf-reader__recent-list button', {
    hasText: 'yuel-reader-smoke.pdf',
  });
  await expect(resumeDocument).toContainText('第 1 页');
  const resumeFileChooserPromise = pdfReader.waitForEvent('filechooser');
  await resumeDocument.click();
  const resumeFileChooser = await resumeFileChooserPromise;
  await resumeFileChooser.setFiles({
    name: 'yuel-reader-smoke.pdf',
    mimeType: 'application/pdf',
    buffer: pdfFixture,
  });
  await expect(pdfReader.locator('.pdf-reader__document-name')).toContainText(
    'yuel-reader-smoke.pdf',
  );
  await expect(rotateButton).toHaveAttribute('title', /当前 90°/);
  const resumedRotatedPosition = await readVisiblePdfPosition(pdfReader);
  expect(Math.abs(
    resumedRotatedPosition.y - rotatedPosition.y,
  )).toBeLessThan(2);
  await pdfReader.locator('body').press('Control+f');
  await expect(pdfReader.locator('.pdf-reader__sidebar')).toBeVisible();

  const zoomInButton = pdfReader.getByRole('button', { name: '放大' });
  await expect(zoomInButton).toHaveCount(1);
  await expect(pdfReader.getByRole('button', { name: '缩小' })).toHaveCount(1);
  await expect(pdfReader.getByLabel('当前缩放比例')).toHaveCount(0);
  await expect(
    pdfReader.locator('.pdf-reader__floating-controls').getByRole('button'),
  ).toHaveCount(2);
  const initialZoom = Number(await zoomInput.inputValue());
  await zoomInButton.click();
  await expect.poll(async () => Number(await zoomInput.inputValue())).toBeGreaterThan(initialZoom);

  const initialGestureZoom = Number(await zoomInput.inputValue());
  const initialBrowserScale = await readBrowserScale(pdfReader);
  const viewportBox = await pdfReader.locator('.pdf-reader__viewport').boundingBox();
  expect(viewportBox).not.toBeNull();
  if (!viewportBox) throw new Error('PDF viewport has no browser geometry');

  await pdfReader.mouse.move(
    viewportBox.x + viewportBox.width / 2,
    viewportBox.y + viewportBox.height / 2,
  );
  await pdfReader.keyboard.down('Control');
  await pdfReader.mouse.wheel(0, -20);
  await pdfReader.keyboard.up('Control');

  await expect.poll(async () => Number(await zoomInput.inputValue())).toBeGreaterThan(
    initialGestureZoom,
  );
  await expect.poll(() => readBrowserScale(pdfReader)).toEqual(initialBrowserScale);

  await pdfReader.locator('.pdf-reader__fit-select select').selectOption('fit-width');
  await zoomInput.fill('135');
  await zoomInput.press('Enter');
  await expect.poll(() => zoomInput.inputValue()).toBe('135');

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

  await toolbarPageInput.fill('2');
  await toolbarPageInput.press('Enter');
  await expect.poll(() => toolbarPageInput.inputValue()).toBe('2');
  await pdfReader.waitForTimeout(500);

  const pdfSidePanel = await openExtensionPage(
    context,
    extensionId,
    'sidepanel.html',
  );
  await pdfReader.bringToFront();
  const pdfSidePanelBody = pdfSidePanel.locator('body');
  await expect.poll(() => pdfSidePanelBody.innerText()).toContain(
    'yuel-reader-smoke.pdf',
  );
  await expect(pdfSidePanelBody).toContainText('当前文档');
  await expect(pdfSidePanelBody).toContainText('文档内容覆盖');
  await expect(pdfSidePanelBody).toContainText('记录中');
  await expect(pdfSidePanelBody).not.toContainText('当前页面无法记录');
  await expect.poll(async () => {
    const text = await pdfSidePanelBody.innerText();
    return text.includes('— / — 词');
  }).toBe(false);
  await pdfSidePanel.close();

  await pdfReader.waitForTimeout(1_250);
  // Exercise the normal lifecycle flush without waiting for the 15-second batch timer.
  await pdfReader.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  const analyticsDashboard = await openExtensionPage(
    context,
    extensionId,
    'dashboard.html',
  );
  await analyticsDashboard.bringToFront();
  await expect.poll(async () => {
    await analyticsDashboard.reload({ waitUntil: 'load' });
    return analyticsDashboard.locator('body').innerText();
  }, { timeout: 10_000 }).toContain('pdf.local');
  await analyticsDashboard.close();

  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  await pdfReader.close();

  const recentReader = await openExtensionPage(
    context,
    extensionId,
    'pdf-reader.html',
  );
  const recentDocument = recentReader.locator('.pdf-reader__recent-list button', {
    hasText: 'yuel-reader-smoke.pdf',
  });
  await expect(recentDocument).toContainText('第 2 页');

  const mismatchedFileChooserPromise = recentReader.waitForEvent('filechooser');
  await recentDocument.click();
  const mismatchedFileChooser = await mismatchedFileChooserPromise;
  await mismatchedFileChooser.setFiles({
    name: 'yuel-reader-smoke.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([pdfFixture, Buffer.from('\n% changed fixture\n')]),
  });
  await expect(recentReader.locator('body')).toContainText('所选 PDF 与阅读记录不匹配');
  await expect(recentReader.locator('body')).toContainText(
    '重新选择 yuel-reader-smoke.pdf',
  );

  const originalFileChooserPromise = recentReader.waitForEvent('filechooser');
  await recentReader.getByRole('button', { name: '选择原 PDF' }).click();
  const originalFileChooser = await originalFileChooserPromise;
  await originalFileChooser.setFiles({
    name: 'yuel-reader-smoke.pdf',
    mimeType: 'application/pdf',
    buffer: pdfFixture,
  });
  await expect(recentReader.locator('.pdf-reader__document-name')).toContainText(
    'yuel-reader-smoke.pdf',
  );
  const recentPageInput = recentReader.locator(
    '.pdf-reader__document-tools .pdf-reader__page-control input',
  );
  await expect.poll(() => recentPageInput.inputValue()).toBe('2');
  await expect(recentReader.locator('.pdf-reader__zoom-input input')).toHaveValue('135');
  await expect(recentReader.getByRole('button', {
    name: '顺时针旋转',
  })).toHaveAttribute('title', /当前 90°/);
  await recentReader.close();
});

async function readBrowserScale(page: import('@playwright/test').Page): Promise<{
  devicePixelRatio: number;
  visualViewportScale: number;
}> {
  return page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    visualViewportScale: window.visualViewport?.scale ?? 1,
  }));
}

async function readVisiblePdfPosition(
  page: import('@playwright/test').Page,
): Promise<{
  x: number;
  y: number;
}> {
  await expect(page.locator('.pdf-reader__page-shell').first()).toBeVisible();
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.pdf-reader__viewport');
    const pdfPage = document.querySelector<HTMLElement>('.pdf-reader__page-shell');
    if (!viewport || !pdfPage) {
      throw new Error('PDF resume geometry is unavailable');
    }

    const viewportRect = viewport.getBoundingClientRect();
    const pageRect = pdfPage.getBoundingClientRect();
    const scale = pageRect.width / 792;
    return {
      x: Math.max(0, viewportRect.left - pageRect.left) / scale,
      y: Math.max(0, viewportRect.top - pageRect.top) / scale,
    };
  });
}

test('records reading data through the extension runtime', async ({ context, extensionId }) => {
  const messagePage = await openExtensionPage(context, extensionId, 'dashboard.html');
  await sendExtensionRuntimeMessage(messagePage, createRuntimeReadingBatchMessage());
  await messagePage.close();

  const dashboard = await openExtensionPage(context, extensionId, 'dashboard.html');
  const dashboardBody = dashboard.locator('body');
  await expect(dashboardBody).toContainText(RUNTIME_LOOP_DOMAIN);
  await expect(dashboardBody).toContainText('今日有效阅读');
  await expect(dashboardBody).toContainText('每日有效时长');
  await expect(dashboardBody).toContainText('最近会话');
  await expect(dashboard.locator('.reading-duration-recent__list li')).toHaveCount(1);
  await expect(dashboardBody).not.toContainText('从下一篇外语文章开始');

  const durationTrend = dashboard.locator('.reading-duration-trend');
  const durationSources = dashboard.locator('.reading-duration-sources');
  await dashboard.setViewportSize({ width: 1280, height: 900 });
  const desktopTrendBox = await durationTrend.boundingBox();
  const desktopSourcesBox = await durationSources.boundingBox();
  expect(desktopTrendBox).not.toBeNull();
  expect(desktopSourcesBox).not.toBeNull();
  expect(desktopSourcesBox?.x).toBeGreaterThanOrEqual(
    (desktopTrendBox?.x ?? 0) + (desktopTrendBox?.width ?? 0) - 1,
  );

  await dashboard.setViewportSize({ width: 520, height: 900 });
  const mobileTrendBox = await durationTrend.boundingBox();
  const mobileSourcesBox = await durationSources.boundingBox();
  expect(mobileTrendBox).not.toBeNull();
  expect(mobileSourcesBox).not.toBeNull();
  expect(mobileSourcesBox?.y).toBeGreaterThanOrEqual(
    (mobileTrendBox?.y ?? 0) + (mobileTrendBox?.height ?? 0) - 1,
  );
  expect(await dashboard.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(520);
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
