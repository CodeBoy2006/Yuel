import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';

import { DashboardApp, type DashboardAppDependencies } from '../../entrypoints/dashboard/App';
import { PopupApp, type PopupAppDependencies } from '../../entrypoints/popup/App';
import {
  SidePanelApp,
  type SidePanelAppDependencies,
  type SidePanelRefreshReason,
} from '../../entrypoints/sidepanel/App';
import { renderForSmoke } from './renderTest';

if (!HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === label);
}

async function clickButton(button: HTMLButtonElement | undefined) {
  expect(button).toBeInstanceOf(HTMLButtonElement);
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function revealTodayCard(container: HTMLElement) {
  await clickButton(findButton(container, '查看今日卡片'));
  expect(container.textContent).toContain('今日卡片预览');
}

describe('extension UI entrypoint smoke rendering', () => {
  it('declares Simplified Chinese for every extension UI document', () => {
    for (const entrypoint of ['popup', 'sidepanel', 'dashboard']) {
      const html = readFileSync(`${process.cwd()}/entrypoints/${entrypoint}/index.html`, 'utf8');
      expect(html).toMatch(/<html\s+lang="zh-CN">/);
    }
  });

  it('renders the popup as a current-site control center first', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: async () => [{ origin: 'https://example.com/*', host: 'example.com' }],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const text = container.textContent ?? '';
    expect(text).toContain('阅量 Yuel');
    expect(text).toContain('当前站点');
    expect(text).toContain('今日有效阅读');
    expect(text).toContain('打开侧栏');
    expect(text).toContain('查看仪表盘');
    expect(text.indexOf('当前站点')).toBeLessThan(text.indexOf('已启用网站'));
  });

  it('renders the side panel around current reading, vocabulary, and highlights', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1540,
            minutes: 18,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: ['docs.example.com'],
            readPages: 4,
            learningWords: 7,
            hasData: true,
          }),
          openDashboard: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('当前阅读');
    expect(container.textContent).toContain('本页有效阅读');
    expect(container.textContent).toContain('今日');
    expect(container.textContent).toContain('值得关注');
    expect(container.textContent).toContain('摘录');
    expect(container.textContent).not.toContain('Observe');
  });

  it('renders the dashboard as a progress instrument panel with the danger action demoted', async () => {
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          getReadingDashboardDetails: async () => ({
            summary: {
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              advancedWords: 0,
              expressions: 0,
              streak: 2,
              topDomains: ['developer.mozilla.org'],
              readPages: 2,
              learningWords: 5,
              hasData: true,
            },
            recentPages: [],
            recentVocabulary: [],
            recentSavedItems: [],
            summaryCardText: 'Yuel Reading - 2026-06-27\nEffective words: 960',
            hasData: true,
          }),
        }}
      />,
    );

    const text = container.textContent ?? '';
    expect(text).toContain('阅读输入仪表盘');
    expect(text).toContain('今日有效阅读');
    expect(text).toContain('查看今日卡片');
    expect(text).toContain('近期阅读量');
    expect(text).toContain('本地数据');
    expect(text.indexOf('今日有效阅读')).toBeLessThan(text.indexOf('清空本地数据'));
    expect(text).not.toContain('Event driven');
  });

  it('renders popup metrics and current-site controls from injected local services', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: async () => [{ origin: 'https://example.com/*', host: 'example.com' }],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('阅量 Yuel');
    expect(container.textContent).toContain('1,280 词');
    expect(container.textContent).toContain('14 分钟');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('已启用');
  });

  it('shows zero popup reading time when only non-time local data exists', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 0,
            learningWords: 5,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: async () => [],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('0 分钟');
    expect(container.textContent).not.toContain('不足 1 分钟');
  });

  it('shows unavailable popup metrics when local reading stats fail to load', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => {
            throw new Error('stats unavailable');
          },
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: async () => [],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('有效阅读不可用');
    expect(container.textContent).toContain('阅读时间不可用');
    expect(container.textContent).toContain('页面不可用');
    expect(container.textContent).toContain('学习中词汇不可用');
    expect(container.textContent).toContain('本地数据暂时不可用');
  });

  it('does not show popup enabled-sites empty state while persisted sites are loading', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: () => new Promise(() => undefined),
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('已启用网站 读取中');
    expect(container.textContent).not.toContain('还没有手动启用的网站');
  });

  it('opens the side panel companion from the popup action', async () => {
    const openSidePanel = vi.fn(async () => undefined);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: async () => [],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel,
        }}
      />,
    );

    const sidePanelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '打开侧栏');
    expect(sidePanelButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      sidePanelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(openSidePanel).toHaveBeenCalledOnce();
  });

  it('shows a popup dashboard launch failure', async () => {
    const openDashboard = vi.fn(async () => {
      throw new Error('tab creation failed');
    });
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: async () => [],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard,
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const dashboardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '查看仪表盘');
    expect(dashboardButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      dashboardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(openDashboard).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('仪表盘暂时不可用');
  });

  it('keeps the popup enable action stable and single-shot while permission is pending', async () => {
    const enableResult = createDeferred<Awaited<ReturnType<PopupAppDependencies['enableCurrentTabSite']>>>();
    const enableCurrentTabSite = vi.fn(() => enableResult.promise);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 0,
            learningWords: 0,
            hasData: false,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: false,
            enabled: false,
            starterSite: false,
          }),
          listEnabledSites: async () => [],
          enableCurrentTabSite,
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const enableButton = findButton(container, '启用当前网站');
    await clickButton(enableButton);

    const pendingButton = findButton(container, '启用中...');
    expect(pendingButton?.disabled).toBe(true);
    expect(pendingButton?.getAttribute('aria-busy')).toBe('true');
    expect(container.textContent).not.toContain('打开侧栏');

    await act(async () => {
      pendingButton?.click();
    });
    expect(enableCurrentTabSite).toHaveBeenCalledOnce();

    await act(async () => {
      enableResult.resolve({
        supported: true,
        tabId: 1,
        url: 'https://example.com/article',
        origin: 'https://example.com/*',
        host: 'example.com',
        granted: true,
        enabled: true,
        starterSite: false,
        injected: true,
      });
      await enableResult.promise;
    });

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('打开侧栏');
  });

  it('keeps the popup pause action stable and disabled while removal is pending', async () => {
    const disableResult = createDeferred<Awaited<ReturnType<PopupAppDependencies['disableEnabledSite']>>>();
    const disableEnabledSite = vi.fn(() => disableResult.promise);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites: async () => [{ origin: 'https://example.com/*', host: 'example.com' }],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite,
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const pauseButton = findButton(container, '暂停记录');
    await clickButton(pauseButton);

    const pendingButton = findButton(container, '暂停中...');
    expect(pendingButton?.disabled).toBe(true);
    expect(pendingButton?.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      pendingButton?.click();
    });
    expect(disableEnabledSite).toHaveBeenCalledOnce();

    await act(async () => {
      disableResult.resolve({ removed: true, remainingOrigins: [] });
      await disableResult.promise;
    });

    expect(disableEnabledSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('未启用');
  });

  it('shows when current-site permission is denied from the popup', async () => {
    const enableCurrentTabSite = vi.fn(async () => ({
      supported: true as const,
      tabId: 1,
      url: 'https://example.com/article',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: false,
      enabled: false,
      starterSite: false,
      injected: false,
    }));
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: false,
            enabled: false,
            starterSite: false,
          }),
          listEnabledSites: async () => [],
          enableCurrentTabSite,
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const enableButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '启用当前网站');
    expect(enableButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      enableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('权限未授予');
  });

  it('tells the user to reload when enabling succeeds but current-tab injection fails', async () => {
    const enableCurrentTabSite = vi.fn(async () => ({
      supported: true as const,
      tabId: 1,
      url: 'https://example.com/article',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      enabled: true,
      starterSite: false,
      injected: false,
    }));
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: false,
            enabled: false,
            starterSite: false,
          }),
          listEnabledSites: vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ origin: 'https://example.com/*', host: 'example.com' }]),
          enableCurrentTabSite,
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const enableButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '启用当前网站');
    expect(enableButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      enableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('已为后续页面启用');
    expect(container.textContent).not.toContain('正在记录此网站的英文阅读');
  });

  it('renders starter-site current access without asking for optional permission', async () => {
    const enableCurrentTabSite = vi.fn();
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 0,
            learningWords: 0,
            hasData: false,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://developer.mozilla.org/en-US/docs/Web/API',
            origin: 'https://developer.mozilla.org/*',
            host: 'developer.mozilla.org',
            granted: false,
            enabled: true,
            starterSite: true,
          }),
          listEnabledSites: async () => [],
          enableCurrentTabSite,
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('developer.mozilla.org');
    expect(container.textContent).toContain('默认记录站点');
    expect(container.textContent).toContain('已启用');
    expect(findButton(container, '打开侧栏')).toBeInstanceOf(HTMLButtonElement);
    expect(findButton(container, '暂停记录')).toBeUndefined();
    expect(findButton(container, '默认记录中')).toBeUndefined();
    expect(enableCurrentTabSite).not.toHaveBeenCalled();
  });

  it('keeps starter-site current access enabled after removing a redundant custom grant', async () => {
    const disableEnabledSite = vi.fn(async () => ({ removed: true, remainingOrigins: [] }));
    const listEnabledSites = vi
      .fn()
      .mockResolvedValueOnce([{ origin: 'https://developer.mozilla.org/*', host: 'developer.mozilla.org' }])
      .mockResolvedValueOnce([]);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 0,
            learningWords: 0,
            hasData: false,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://developer.mozilla.org/en-US/docs/Web/API',
            origin: 'https://developer.mozilla.org/*',
            host: 'developer.mozilla.org',
            granted: true,
            enabled: true,
            starterSite: true,
          }),
          listEnabledSites,
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite,
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const manageButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('已启用网站'));
    expect(manageButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      manageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const removeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '移除');
    expect(removeButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(disableEnabledSite).toHaveBeenCalledWith('https://developer.mozilla.org/*');
    expect(container.textContent).toContain('默认记录站点');
    expect(findButton(container, '打开侧栏')).toBeInstanceOf(HTMLButtonElement);
    expect(findButton(container, '暂停记录')).toBeUndefined();
    expect(findButton(container, '默认记录中')).toBeUndefined();
    expect(findButton(container, '启用当前网站')).toBeUndefined();
  });

  it('shows when enabled-site removal fails without hiding current-site access', async () => {
    const disableEnabledSite = vi.fn(async () => {
      throw new Error('permission removal failed');
    });
    const listEnabledSites = vi.fn(async () => [{ origin: 'https://example.com/*', host: 'example.com' }]);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites,
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite,
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const pauseButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '暂停记录');
    expect(pauseButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      pauseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(disableEnabledSite).toHaveBeenCalledWith('https://example.com/*');
    expect(listEnabledSites).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('移除失败，此网站仍保持启用');
    expect(container.textContent).toContain('正在记录此网站的英文阅读');
    expect(container.textContent).not.toContain('权限状态不可用');
  });

  it('keeps current-site access visible when the enabled-site list fails to load', async () => {
    const listEnabledSites = vi.fn(async () => {
      throw new Error('enabled sites unavailable');
    });
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
          }),
          listEnabledSites,
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(listEnabledSites).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('已启用网站 不可用');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('正在记录此网站的英文阅读');
    expect(container.textContent).not.toContain('还没有手动启用的网站');
    expect(container.textContent).not.toContain('权限状态不可用');
  });

  it('renders dashboard summary, recent pages, and vocabulary exposure from injected local services', async () => {
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          getReadingDashboardDetails: async () => ({
            summary: {
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              advancedWords: 0,
              expressions: 0,
              streak: 0,
              topDomains: ['developer.mozilla.org'],
              readPages: 2,
              learningWords: 5,
              hasData: true,
            },
            recentPages: [
              {
                pageId: 'page-1',
                domain: 'developer.mozilla.org',
                totalWords: 1200,
                effectiveWords: 620,
                lastReadAt: Date.UTC(2026, 5, 27, 10, 0, 0),
              },
            ],
            recentVocabulary: [
              {
                lemma: 'resilience',
                seenCount: 4,
                effectiveSeenCount: 3,
                lookupCount: 0,
                savedCount: 2,
                lastSeenAt: Date.UTC(2026, 5, 27, 10, 0, 0),
                packTags: ['architecture'],
                userStatus: 'learning',
              },
            ],
            recentSavedItems: [
              {
                id: 'saved-1',
                text: 'fail gracefully under pressure',
                type: 'phrase',
                sourceDomain: 'developer.mozilla.org',
                tags: ['selection'],
                createdAt: Date.UTC(2026, 5, 27, 10, 5, 0),
              },
            ],
            summaryCardText:
              'Yuel Reading - 2026-06-27\nEffective words: 960\nReading time: 11 min\nPages: 2\nVocabulary: resilience\nSaved: fail gracefully under pressure',
            hasData: true,
          }),
        }}
      />,
    );

    expect(container.textContent).toContain('阅读输入仪表盘');
    expect(container.textContent).toContain('960');
    expect(container.textContent).toContain('developer.mozilla.org');
    expect(container.textContent).toContain('resilience');
    expect(container.textContent).toContain('已收藏 2');
    expect(container.textContent).toContain('architecture');
    expect(container.textContent).toContain('fail gracefully under pressure');
    expect(container.textContent).toContain('保存摘录');
    expect(container.textContent).toContain('查看今日卡片');
    expect(container.textContent).not.toContain('今日卡片预览');
    expect(container.textContent).toContain('今日有效阅读');

    const pageProgress = container.querySelector<HTMLElement>('[role="progressbar"]');
    expect(pageProgress?.getAttribute('aria-label')).toBe('developer.mozilla.org 阅读进度');
    expect(pageProgress?.getAttribute('aria-valuemin')).toBe('0');
    expect(pageProgress?.getAttribute('aria-valuenow')).toBe('620');
    expect(pageProgress?.getAttribute('aria-valuemax')).toBe('1200');
    expect(pageProgress?.getAttribute('aria-valuetext')).toBe('620 / 1,200 词');

    await revealTodayCard(container);
  });

  it('saves dashboard onboarding reading pace calibration', async () => {
    const saveResult = createDeferred<
      Awaited<ReturnType<NonNullable<DashboardAppDependencies['saveOnboardingReadingPaceCalibration']>>>
    >();
    const saveOnboardingReadingPaceCalibration = vi.fn<NonNullable<DashboardAppDependencies['saveOnboardingReadingPaceCalibration']>>(
      () => saveResult.promise,
    );
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          getReadingPaceSummary: async () => ({
            language: 'en',
            contentType: 'general',
            baseWordsPerMinute: 220,
            sampleCount: 0,
            source: 'default',
            hasProfile: false,
          }),
          saveOnboardingReadingPaceCalibration,
          getReadingDashboardDetails: async () => ({
            summary: {
              date: '2026-06-27',
              effectiveWords: 0,
              minutes: 0,
              advancedWords: 0,
              expressions: 0,
              streak: 0,
              topDomains: [],
              readPages: 0,
              learningWords: 0,
              hasData: false,
            },
            recentPages: [],
            recentVocabulary: [],
            recentSavedItems: [],
            summaryCardText: 'Yuel Reading - 2026-06-27\nNo reading data yet.',
            hasData: false,
          }),
        }}
      />,
    );

    const startButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '开始校准');
    expect(startButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('我已读完');
    expect(container.querySelector('article.calibration-passage')?.getAttribute('lang')).toBe('en');

    nowSpy.mockReturnValue(61_000);
    const finishedButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '我已读完');
    await act(async () => {
      finishedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    for (const label of ['Duplicating visible paragraphs', 'When answers are solid', 'High confidence real-page samples']) {
      const optionLabel = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent === label);
      const optionInput = optionLabel?.querySelector<HTMLInputElement>('input[type="radio"]');
      expect(optionInput).toBeInstanceOf(HTMLInputElement);
      await act(async () => {
        optionInput?.click();
      });
      expect(optionInput?.checked).toBe(true);
    }
    expect(container.querySelector('#pace-calibration')?.getAttribute('lang')).toBe('en');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存校准');
    expect(saveButton).toBeInstanceOf(HTMLButtonElement);
    nowSpy.mockReturnValue(181_000);
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const pendingSaveButton = findButton(container, '保存中...');
    const cancelButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.textContent === '取消' || button.getAttribute('aria-label') === '取消校准',
    );
    const clearButton = findButton(container, '清空本地数据');
    expect(pendingSaveButton?.disabled).toBe(true);
    expect(cancelButtons).toHaveLength(2);
    expect(cancelButtons.every((button) => button.disabled)).toBe(true);
    expect(clearButton?.disabled).toBe(true);
    expect(Array.from(container.querySelectorAll<HTMLFieldSetElement>('fieldset')).every((fieldset) => fieldset.disabled)).toBe(true);

    await act(async () => {
      saveResult.resolve({
        language: 'en',
        contentType: 'general',
        baseWordsPerMinute: 233,
        sampleCount: 0,
        source: 'onboarding',
        updatedAt: 61_000,
        hasProfile: true,
      });
      await saveResult.promise;
    });

    expect(saveOnboardingReadingPaceCalibration).toHaveBeenCalledWith(
      expect.objectContaining({
        language: 'en',
        contentType: 'general',
        startedAt: 1_000,
        completedAt: 61_000,
        correctAnswers: 3,
        questionCount: 3,
      }),
    );
    const calibrationInput = saveOnboardingReadingPaceCalibration.mock.calls[0]?.[0];
    expect(calibrationInput?.wordCount).toBeGreaterThanOrEqual(200);
    expect(calibrationInput?.wordCount).toBeLessThanOrEqual(260);
    expect(container.textContent).toContain('233 WPM');

    nowSpy.mockRestore();
  });

  it('keeps the dashboard error state exclusive and retries into the empty state', async () => {
    const getReadingDashboardDetails = vi
      .fn()
      .mockRejectedValueOnce(new Error('details unavailable'))
      .mockResolvedValueOnce({
        summary: {
          date: '2026-06-27',
          effectiveWords: 0,
          minutes: 0,
          advancedWords: 0,
          expressions: 0,
          streak: 0,
          topDomains: [],
          readPages: 0,
          learningWords: 0,
          hasData: false,
        },
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        summaryCardText: 'Yuel Reading - 2026-06-27\nNo reading data yet.',
        hasData: false,
      });
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          getReadingDashboardDetails,
        }}
      />,
    );

    expect(container.textContent).toContain('本地数据不可用');
    expect(container.textContent).not.toContain('正在读取本地数据');
    expect(container.textContent).not.toContain('从下一篇外语文章开始');
    expect(container.textContent).not.toContain('今日有效阅读');

    await clickButton(findButton(container, '重新读取'));

    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('从下一篇外语文章开始');
    expect(container.textContent).not.toContain('本地数据不可用');
    expect(container.textContent).not.toContain('正在读取本地数据');
    expect(container.textContent).not.toContain('今日有效阅读');
  });

  it('does not show dashboard empty states while local reading details are loading', async () => {
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          getReadingDashboardDetails: () => new Promise(() => undefined),
        }}
      />,
    );

    expect(container.textContent).toContain('正在读取本地数据');
    expect(container.textContent).not.toContain('本地数据不可用');
    expect(container.textContent).not.toContain('从下一篇外语文章开始');
    expect(container.textContent).not.toContain('今日有效阅读');
    expect(container.textContent).not.toContain('还没有阅读记录。');
    expect(container.textContent).not.toContain('还没有词汇暴露记录。');
    expect(container.textContent).not.toContain('还没有保存摘录。');
  });

  it('copies the dashboard share card text through injected clipboard service', async () => {
    const copyTextToClipboard = vi.fn(async () => undefined);
    const summaryCardText =
      'Yuel Reading - 2026-06-27\nEffective words: 960\nReading time: 11 min\nPages: 2\nVocabulary: resilience\nSaved: fail gracefully under pressure';
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          copyTextToClipboard,
          getReadingDashboardDetails: async () => ({
            summary: {
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              advancedWords: 0,
              expressions: 0,
              streak: 0,
              topDomains: ['developer.mozilla.org'],
              readPages: 2,
              learningWords: 5,
              hasData: true,
            },
            recentPages: [],
            recentVocabulary: [],
            recentSavedItems: [],
            summaryCardText,
            hasData: true,
          }),
        }}
      />,
    );

    await revealTodayCard(container);
    const copyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '复制文案');
    expect(copyButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith(summaryCardText);
    expect(container.textContent).toContain('已复制');
  });

  it('exports the dashboard share card as a PNG through injected renderer', async () => {
    const exportSummaryCardPng = vi.fn(async () => undefined);
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          exportSummaryCardPng,
          getReadingDashboardDetails: async () => ({
            summary: {
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              advancedWords: 0,
              expressions: 0,
              streak: 0,
              topDomains: ['developer.mozilla.org'],
              readPages: 2,
              learningWords: 5,
              hasData: true,
            },
            recentPages: [],
            recentVocabulary: [],
            recentSavedItems: [],
            summaryCardText: 'Yuel Reading - 2026-06-27\nEffective words: 960',
            hasData: true,
          }),
        }}
      />,
    );

    await revealTodayCard(container);
    const downloadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '下载 PNG');
    expect(downloadButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(exportSummaryCardPng).toHaveBeenCalledWith(expect.any(HTMLElement), 'yuel-reading-2026-06-27.png');
    expect(container.textContent).toContain('已下载');
  });

  it('clears local dashboard data through injected services', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce({
        summary: {
          date: '2026-06-27',
          effectiveWords: 960,
          minutes: 11,
          advancedWords: 0,
          expressions: 0,
          streak: 0,
          topDomains: ['developer.mozilla.org'],
          readPages: 2,
          learningWords: 5,
          hasData: true,
        },
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        summaryCardText: 'Yuel Reading - 2026-06-27\nEffective words: 960',
        hasData: true,
      })
      .mockResolvedValueOnce({
        summary: {
          date: '2026-06-27',
          effectiveWords: 0,
          minutes: 0,
          advancedWords: 0,
          expressions: 0,
          streak: 0,
          topDomains: [],
          readPages: 0,
          learningWords: 0,
          hasData: false,
        },
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        summaryCardText: 'Yuel Reading - 2026-06-27\nNo reading data yet.',
        hasData: false,
      });
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          getReadingDashboardDetails,
          clearLocalReadingData,
          confirmClearLocalReadingData: () => true,
        }}
      />,
    );

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '清空本地数据');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('从下一篇外语文章开始');
  });

  it('resets copied dashboard share state after local data is cleared', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const copyTextToClipboard = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce({
        summary: {
          date: '2026-06-27',
          effectiveWords: 960,
          minutes: 11,
          advancedWords: 0,
          expressions: 0,
          streak: 0,
          topDomains: ['developer.mozilla.org'],
          readPages: 2,
          learningWords: 5,
          hasData: true,
        },
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        summaryCardText: 'Yuel Reading - 2026-06-27\nEffective words: 960',
        hasData: true,
      })
      .mockResolvedValueOnce({
        summary: {
          date: '2026-06-27',
          effectiveWords: 0,
          minutes: 0,
          advancedWords: 0,
          expressions: 0,
          streak: 0,
          topDomains: [],
          readPages: 0,
          learningWords: 0,
          hasData: false,
        },
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        summaryCardText: 'Yuel Reading - 2026-06-27\nNo reading data yet.',
        hasData: false,
      });
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          getReadingDashboardDetails,
          clearLocalReadingData,
          confirmClearLocalReadingData: () => true,
          copyTextToClipboard,
        }}
      />,
    );

    await revealTodayCard(container);
    const copyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '复制文案');
    expect(copyButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('已复制');

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '清空本地数据');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('.dashboard-state--empty')).toHaveLength(1);
    expect(container.textContent).toContain('从下一篇外语文章开始');
    expect(container.textContent).not.toContain('今日有效阅读');
    expect(container.textContent).not.toContain('今日卡片预览');
    expect(container.textContent).not.toContain('查看今日卡片');
    expect(container.textContent).not.toContain('复制文案');
    expect(container.textContent).not.toContain('下载 PNG');
    expect(container.textContent).not.toContain('已复制');
  });

  it('shows a clear failure without refreshing dashboard data', async () => {
    const clearLocalReadingData = vi.fn(async () => {
      throw new Error('clear failed');
    });
    const getReadingDashboardDetails = vi.fn(async () => ({
      summary: {
        date: '2026-06-27',
        effectiveWords: 960,
        minutes: 11,
        advancedWords: 0,
        expressions: 0,
        streak: 0,
        topDomains: ['developer.mozilla.org'],
        readPages: 2,
        learningWords: 5,
        hasData: true,
      },
      recentPages: [],
      recentVocabulary: [],
      recentSavedItems: [],
      summaryCardText: 'Yuel Reading - 2026-06-27\nEffective words: 960',
      hasData: true,
    }));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          getReadingDashboardDetails,
          clearLocalReadingData,
          confirmClearLocalReadingData: () => true,
        }}
      />,
    );

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '清空本地数据');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('清空失败，本地数据未改变。');
    expect(container.textContent).toContain('960');
  });

  it('shows a refresh failure after local dashboard data is cleared', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce({
        summary: {
          date: '2026-06-27',
          effectiveWords: 960,
          minutes: 11,
          advancedWords: 0,
          expressions: 0,
          streak: 0,
          topDomains: ['developer.mozilla.org'],
          readPages: 2,
          learningWords: 5,
          hasData: true,
        },
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        summaryCardText: 'Yuel Reading - 2026-06-27\nEffective words: 960',
        hasData: true,
      })
      .mockRejectedValueOnce(new Error('refresh failed'));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          getReadingDashboardDetails,
          clearLocalReadingData,
          confirmClearLocalReadingData: () => true,
        }}
      />,
    );

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '清空本地数据');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('本地数据不可用');
    expect(container.textContent).toContain('本地数据已清空，但仪表盘刷新失败。');
    expect(container.textContent).not.toContain('清空失败，本地数据未改变。');
  });

  it('does not clear local dashboard data when confirmation is declined', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi.fn(async () => ({
      summary: {
        date: '2026-06-27',
        effectiveWords: 960,
        minutes: 11,
        advancedWords: 0,
        expressions: 0,
        streak: 0,
        topDomains: ['developer.mozilla.org'],
        readPages: 2,
        learningWords: 5,
        hasData: true,
      },
      recentPages: [],
      recentVocabulary: [],
      recentSavedItems: [],
      summaryCardText: 'Yuel Reading - 2026-06-27\nEffective words: 960',
      hasData: true,
    }));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          getReadingDashboardDetails,
          clearLocalReadingData,
          confirmClearLocalReadingData: () => false,
        }}
      />,
    );

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '清空本地数据');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).not.toHaveBeenCalled();
    expect(getReadingDashboardDetails).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('本地数据已读取');
  });

  it('clears stale side panel host and page metrics while navigation access is pending', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const nextAccess = createDeferred<
      Awaited<ReturnType<NonNullable<SidePanelAppDependencies['getCurrentTabSiteAccess']>>>
    >();
    const getCurrentTabSiteAccess = vi
      .fn()
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 1,
        url: 'https://old.example/article',
        origin: 'https://old.example/*',
        host: 'old.example',
        granted: true,
        enabled: true,
        starterSite: false,
      })
      .mockImplementationOnce(() => nextAccess.promise);
    const getCurrentPageReadingSummary = vi.fn(async (url: string) => (
      url.includes('new.example')
        ? {
            pageId: 'new',
            domain: 'new.example',
            totalWords: 1200,
            effectiveWords: 420,
            effectiveMinutes: 5,
            confidence: 0.72,
            hasData: true,
          }
        : {
            pageId: 'old',
            domain: 'old.example',
            totalWords: 1000,
            effectiveWords: 345,
            effectiveMinutes: 4,
            confidence: 0.6,
            hasData: true,
          }
    ));
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 700,
            minutes: 8,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 2,
            learningWords: 3,
            hasData: true,
          }),
          getCurrentTabSiteAccess,
          getCurrentPageReadingSummary,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
          openDashboard: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('old.example');
    expect(container.textContent).toContain('345 / 1,000 词');

    await act(async () => {
      requestRefresh?.('navigation');
      await Promise.resolve();
    });

    expect(getCurrentTabSiteAccess).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('old.example');
    expect(container.textContent).not.toContain('345 / 1,000 词');
    expect(container.textContent).toContain('— / — 词');
    expect(container.textContent).toContain('正在读取当前页面');

    await act(async () => {
      nextAccess.resolve({
        supported: true,
        tabId: 2,
        url: 'https://new.example/guide',
        origin: 'https://new.example/*',
        host: 'new.example',
        granted: true,
        enabled: true,
        starterSite: false,
      });
      for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
      }
    });

    expect(getCurrentPageReadingSummary).toHaveBeenLastCalledWith('https://new.example/guide');
    expect(container.textContent).toContain('new.example');
    expect(container.textContent).toContain('420 / 1,200 词');
  });

  it('ignores a late page result from an older rapid side panel refresh', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const staleAccess = createDeferred<
      Awaited<ReturnType<NonNullable<SidePanelAppDependencies['getCurrentTabSiteAccess']>>>
    >();
    const stalePage = createDeferred<
      Awaited<ReturnType<NonNullable<SidePanelAppDependencies['getCurrentPageReadingSummary']>>>
    >();
    const getCurrentTabSiteAccess = vi
      .fn()
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 1,
        url: 'https://initial.example/article',
        origin: 'https://initial.example/*',
        host: 'initial.example',
        granted: true,
        enabled: true,
        starterSite: false,
      })
      .mockImplementationOnce(() => staleAccess.promise)
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 3,
        url: 'https://fresh.example/guide',
        origin: 'https://fresh.example/*',
        host: 'fresh.example',
        granted: true,
        enabled: true,
        starterSite: false,
      });
    const getCurrentPageReadingSummary = vi.fn((url: string) => {
      if (url.includes('stale.example')) return stalePage.promise;
      return Promise.resolve(
        url.includes('fresh.example')
          ? {
              pageId: 'fresh',
              domain: 'fresh.example',
              totalWords: 1000,
              effectiveWords: 420,
              effectiveMinutes: 5,
              confidence: 0.75,
              hasData: true,
            }
          : {
              pageId: 'initial',
              domain: 'initial.example',
              totalWords: 100,
              effectiveWords: 10,
              effectiveMinutes: 1,
              confidence: 0.5,
              hasData: true,
            },
      );
    });
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 900,
            minutes: 10,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 4,
            hasData: true,
          }),
          getCurrentTabSiteAccess,
          getCurrentPageReadingSummary,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
          openDashboard: vi.fn(),
        }}
      />,
    );

    await act(async () => {
      requestRefresh?.('tick');
      staleAccess.resolve({
        supported: true,
        tabId: 2,
        url: 'https://stale.example/article',
        origin: 'https://stale.example/*',
        host: 'stale.example',
        granted: true,
        enabled: true,
        starterSite: false,
      });
      for (let index = 0; index < 3; index += 1) {
        await Promise.resolve();
      }
    });
    expect(getCurrentPageReadingSummary).toHaveBeenCalledWith('https://stale.example/article');

    await act(async () => {
      requestRefresh?.('tab');
      for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
      }
    });

    expect(container.textContent).toContain('fresh.example');
    expect(container.textContent).toContain('420 / 1,000 词');

    await act(async () => {
      stalePage.resolve({
        pageId: 'stale',
        domain: 'stale.example',
        totalWords: 900,
        effectiveWords: 777,
        effectiveMinutes: 9,
        confidence: 0.9,
        hasData: true,
      });
      for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
      }
    });

    expect(container.textContent).toContain('fresh.example');
    expect(container.textContent).toContain('420 / 1,000 词');
    expect(container.textContent).not.toContain('stale.example');
    expect(container.textContent).not.toContain('777 / 900 词');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('420');
  });

  it('refreshes side panel totals and current-page context when the active tab changes', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const unsubscribe = vi.fn();
    const getTodayReadingSummary = vi
      .fn()
      .mockResolvedValueOnce({
        date: '2026-06-27',
        effectiveWords: 600,
        minutes: 7,
        advancedWords: 0,
        expressions: 0,
        streak: 0,
        topDomains: ['first.example'],
        readPages: 1,
        learningWords: 2,
        hasData: true,
      })
      .mockResolvedValueOnce({
        date: '2026-06-27',
        effectiveWords: 1540,
        minutes: 18,
        advancedWords: 0,
        expressions: 0,
        streak: 0,
        topDomains: ['second.example'],
        readPages: 4,
        learningWords: 7,
        hasData: true,
      });
    const getCurrentTabSiteAccess = vi
      .fn()
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 1,
        url: 'https://first.example/article',
        origin: 'https://first.example/*',
        host: 'first.example',
        granted: true,
        enabled: true,
        starterSite: false,
      })
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 2,
        url: 'https://second.example/guide',
        origin: 'https://second.example/*',
        host: 'second.example',
        granted: true,
        enabled: true,
        starterSite: false,
      });
    const getCurrentPageReadingSummary = vi.fn(async (url: string) => (
      url.includes('second.example')
        ? {
            pageId: 'second',
            domain: 'second.example',
            totalWords: 1200,
            effectiveWords: 420,
            effectiveMinutes: 5,
            confidence: 0.72,
            hasData: true,
          }
        : {
            pageId: 'first',
            domain: 'first.example',
            totalWords: 1000,
            effectiveWords: 100,
            effectiveMinutes: 1,
            confidence: 0.5,
            hasData: true,
          }
    ));
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary,
          getCurrentTabSiteAccess,
          getCurrentPageReadingSummary,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return unsubscribe;
          },
          openDashboard: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('first.example');
    expect(container.textContent).toContain('600 词');

    await act(async () => {
      requestRefresh?.('tab');
      for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
      }
    });

    expect(getTodayReadingSummary).toHaveBeenCalledTimes(2);
    expect(getCurrentTabSiteAccess).toHaveBeenCalledTimes(2);
    expect(getCurrentPageReadingSummary).toHaveBeenLastCalledWith('https://second.example/guide');
    expect(container.textContent).toContain('second.example');
    expect(container.textContent).toContain('1,540 词');
    expect(container.textContent).toContain('420 / 1,200 词');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('420');
  });

  it('keeps the side panel enable action stable and single-shot while permission is pending', async () => {
    const enableResult = createDeferred<Awaited<ReturnType<NonNullable<SidePanelAppDependencies['enableCurrentTabSite']>>>>();
    const enableCurrentTabSite = vi.fn(() => enableResult.promise);
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 0,
            learningWords: 0,
            hasData: false,
          }),
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: false,
            enabled: false,
            starterSite: false,
          }),
          enableCurrentTabSite,
          subscribeToRefresh: () => vi.fn(),
          openDashboard: vi.fn(),
        }}
      />,
    );

    await clickButton(findButton(container, '启用当前网站'));

    const pendingButton = findButton(container, '启用中...');
    expect(pendingButton?.disabled).toBe(true);
    expect(pendingButton?.getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      pendingButton?.click();
    });
    expect(enableCurrentTabSite).toHaveBeenCalledOnce();

    await act(async () => {
      enableResult.resolve({
        supported: true,
        tabId: 1,
        url: 'https://example.com/article',
        origin: 'https://example.com/*',
        host: 'example.com',
        granted: true,
        enabled: true,
        starterSite: false,
        injected: true,
      });
      await enableResult.promise;
    });

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('记录中');
    expect(container.textContent).not.toContain('启用当前网站');
  });

  it('renders side panel companion metrics from injected local services', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1540,
            minutes: 18,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: ['docs.example.com'],
            readPages: 4,
            learningWords: 7,
            hasData: true,
          }),
          openDashboard: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('当前阅读');
    expect(container.textContent).toContain('1,540 词');
    expect(container.textContent).toContain('18 分钟');
    expect(container.textContent).toContain('4 页');
    expect(container.textContent).toContain('docs.example.com');
  });

  it('shows no-data side panel time metric when local reading stats are empty', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: [],
            readPages: 0,
            learningWords: 0,
            hasData: false,
          }),
          openDashboard: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('待开始');
    expect(container.textContent).toContain('阅读时间0 分钟');
    expect(container.textContent).not.toContain('阅读时间不足 1 分钟');
  });

  it('does not show side panel top-domain empty state while local summary is loading', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: () => new Promise(() => undefined),
          openDashboard: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('读取中');
    expect(container.textContent).not.toContain('暂无当前网站');
  });

  it('shows unavailable side panel metrics when local reading stats fail to load', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => {
            throw new Error('stats unavailable');
          },
          openDashboard: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('不可用');
    expect(container.textContent).toContain('有效阅读不可用');
    expect(container.textContent).toContain('阅读时间不可用');
    expect(container.textContent).toContain('页面不可用');
    expect(container.textContent).toContain('学习中词汇不可用');
    expect(container.textContent).not.toContain('暂无当前网站');
  });

  it('opens the dashboard from the side panel companion action', async () => {
    const openDashboard = vi.fn(async () => undefined);
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1540,
            minutes: 18,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: ['docs.example.com'],
            readPages: 4,
            learningWords: 7,
            hasData: true,
          }),
          openDashboard,
        }}
      />,
    );

    const dashboardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '打开仪表盘');
    expect(dashboardButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      dashboardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(openDashboard).toHaveBeenCalledOnce();
  });

  it('shows a side panel dashboard launch failure', async () => {
    const openDashboard = vi.fn(async () => {
      throw new Error('tab creation failed');
    });
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={{
          getTodayReadingSummary: async () => ({
            date: '2026-06-27',
            effectiveWords: 1540,
            minutes: 18,
            advancedWords: 0,
            expressions: 0,
            streak: 0,
            topDomains: ['docs.example.com'],
            readPages: 4,
            learningWords: 7,
            hasData: true,
          }),
          openDashboard,
        }}
      />,
    );

    const dashboardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '打开仪表盘');
    expect(dashboardButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      dashboardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(openDashboard).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('仪表盘暂时不可用');
  });
});
