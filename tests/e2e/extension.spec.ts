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
import { STARTER_SITE_HOST, withStarterSite } from './helpers/starterSite';

test('loads the packaged extension pages', async ({ context, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);

  const dashboard = await openExtensionPage(context, extensionId, 'dashboard.html');
  await expect(dashboard.locator('body')).toContainText('阅读输入仪表盘');
  await dashboard.close();

  const popup = await openExtensionPage(context, extensionId, 'popup.html');
  await expect(popup.locator('body')).toContainText('阅量 Yuel');
  await popup.close();

  const sidePanel = await openExtensionPage(context, extensionId, 'sidepanel.html');
  await expect(sidePanel.locator('body')).toContainText('当前阅读');
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

test('updates the toolbar logo from daily progress through the completed state', async ({
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
});

test('records starter-site reading and reports the live collector state', async ({ context, extensionId, extensionWorker }) => {
  await withStarterSite(async (starterSiteUrl) => {
    const starterPage = await context.newPage();
    await starterPage.goto(starterSiteUrl, { waitUntil: 'load' });
    await expect(starterPage.locator('body')).toContainText('Starter content script reading loop');
    await expect.poll(() => readActiveTabCollectorStatus(extensionWorker)).toMatchObject({
      collecting: true,
      url: starterSiteUrl,
    });

    // Hiding the page flushes the current batch. Let one viewport sample
    // complete first so the flushed batch contains effective reading evidence.
    await starterPage.waitForTimeout(1_250);

    let dashboardText = '';
    await expect.poll(async () => {
      dashboardText = await readExtensionPageText(context, extensionId, 'dashboard.html');
      return dashboardText;
    }).toContain(STARTER_SITE_HOST);
    expect(dashboardText).not.toContain('从下一篇外语文章开始');

    const sidePanel = await openExtensionPage(context, extensionId, 'sidepanel.html');
    await starterPage.bringToFront();
    const sidePanelBody = sidePanel.locator('body');
    await expect(sidePanelBody).toContainText(STARTER_SITE_HOST);
    await expect(sidePanelBody).toContainText('记录中');
    await expect(sidePanelBody).not.toContainText('不可记录');
  });
});
