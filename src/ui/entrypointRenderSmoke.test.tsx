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

Object.defineProperty(window, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(Date.now()));
    return 1;
  },
});

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
  const toggle = findButton(container, '查看今日卡片');
  expect(toggle?.getAttribute('aria-controls')).toBeNull();
  await clickButton(toggle);
  expect(findButton(container, '收起今日卡片')?.getAttribute('aria-controls')).toBe('share-card');
  expect(container.textContent).toContain('今日打卡卡片');
  expect(container.querySelector('.share-card-preview .sr-only')).toBeNull();
}

function createDashboardDetails(effectiveWords = 0, domain = 'docs.example.com') {
  const hasData = effectiveWords > 0;
  const checkInThresholdWords = 500;
  const checkInCompleted = effectiveWords >= checkInThresholdWords;
  const topDomains = hasData ? [domain] : [];
  const summary = {
    date: '2026-06-27',
    effectiveWords,
    minutes: effectiveWords / 100,
    streak: checkInCompleted ? 2 : 0,
    checkInThresholdWords,
    checkInCompleted,
    topDomains,
    readPages: hasData ? 1 : 0,
    learningWords: hasData ? 3 : 0,
    hasData,
  };

  return {
    summary,
    history: [{
      date: summary.date,
      effectiveWords,
      minutes: summary.minutes,
      newWords: 0,
      reviewWords: 0,
      checkInCompleted,
      topDomains,
    }],
    recentPages: [],
    recentVocabulary: [],
    recentSavedItems: [],
    hasData,
  };
}

type TodaySummary = Awaited<ReturnType<PopupAppDependencies['getTodayReadingSummary']>>;

function createTodayReadingSummary(overrides: Partial<TodaySummary> = {}): TodaySummary {
  const effectiveWords = overrides.effectiveWords ?? 0;
  const checkInThresholdWords = overrides.checkInThresholdWords ?? 500;

  return {
    ...createDashboardDetails(effectiveWords).summary,
    ...overrides,
    checkInThresholdWords,
    checkInCompleted: overrides.checkInCompleted ?? effectiveWords >= checkInThresholdWords,
  };
}

function createDashboardDependencies(
  overrides: Partial<DashboardAppDependencies> = {},
): DashboardAppDependencies {
  return {
    clearLocalReadingData: async () => undefined,
    confirmClearLocalReadingData: () => true,
    copyTextToClipboard: async () => undefined,
    exportSummaryCardPng: async () => undefined,
    getWebsiteFaviconUrl: () => undefined,
    getReadingDashboardDetails: async () => createDashboardDetails(),
    getReadingPaceSummary: async () => ({
      language: 'en',
      contentType: 'general',
      baseWordsPerMinute: 220,
      sampleCount: 0,
      source: 'default',
      hasProfile: false,
    }),
    getShareCardSettings: async () => ({
      theme: 'forest',
      siteLimit: 3,
      showSiteIcons: true,
      showStreak: true,
    }),
    saveOnboardingReadingPaceCalibration: async (input) => ({
      language: input.language ?? 'en',
      contentType: input.contentType ?? 'general',
      baseWordsPerMinute: 220,
      sampleCount: 1,
      source: 'onboarding',
      hasProfile: true,
      calibrationAccepted: true,
    }),
    saveDailyCheckInThresholdWords: async (thresholdWords) => thresholdWords,
    saveShareCardSettings: async (settings) => ({ ...settings }),
    ...overrides,
  };
}

type SidePanelDetails = Awaited<ReturnType<SidePanelAppDependencies['getSidePanelReadingDetails']>>;

function createSidePanelDetails(
  summaryOverrides: Partial<TodaySummary> = {},
): SidePanelDetails {
  return {
    summary: {
      ...createDashboardDetails().summary,
      ...summaryOverrides,
    },
    recentVocabulary: [],
    recentSavedItems: [],
  };
}

function createSidePanelDependencies(
  overrides: Partial<SidePanelAppDependencies> = {},
): SidePanelAppDependencies {
  return {
    getSidePanelReadingDetails: async () => createSidePanelDetails(),
    getCurrentTabSiteAccess: async () => ({
      supported: true,
      tabId: 1,
      url: 'https://docs.example.com/article',
      origin: 'https://docs.example.com/*',
      host: 'docs.example.com',
      granted: true,
      enabled: true,
      starterSite: false,
      collectorState: 'recording',
    }),
    getCurrentPageReadingSummary: async () => ({
      pageId: 'page-default',
      domain: 'docs.example.com',
      totalWords: 0,
      effectiveWords: 0,
      coveredWords: 0,
      effectiveMinutes: 0,
      hasData: false,
    }),
    enableCurrentTabSite: async () => ({
      supported: true,
      tabId: 1,
      url: 'https://docs.example.com/article',
      origin: 'https://docs.example.com/*',
      host: 'docs.example.com',
      granted: true,
      enabled: true,
      starterSite: false,
      collectorState: 'recording',
      injected: true,
    }),
    subscribeToRefresh: () => () => undefined,
    openDashboard: async () => undefined,
    ...overrides,
  };
}

async function renderSidePanelWithAccess(
  access: Awaited<ReturnType<SidePanelAppDependencies['getCurrentTabSiteAccess']>>,
) {
  return renderForSmoke(
    <SidePanelApp
      dependencies={createSidePanelDependencies({
        getSidePanelReadingDetails: async () => createSidePanelDetails(createDashboardDetails(320).summary),
        getCurrentTabSiteAccess: async () => access,
      })}
    />,
  );
}

describe('extension UI entrypoint smoke rendering', () => {
  it('declares Simplified Chinese and the shared brand icon for every extension UI document', () => {
    for (const entrypoint of ['popup', 'sidepanel', 'dashboard']) {
      const html = readFileSync(`${process.cwd()}/entrypoints/${entrypoint}/index.html`, 'utf8');
      expect(html).toMatch(/<html\s+lang="zh-CN">/);
      expect(html).toContain('<link rel="icon" href="/logo.svg" type="image/svg+xml" />');
    }
  });

  it('keeps the newest dashboard refresh and refreshes again when the visible page regains focus', async () => {
    const staleLoad = createDeferred<ReturnType<typeof createDashboardDetails>>();
    const getReadingDashboardDetails = vi
      .fn()
      .mockImplementationOnce(() => staleLoad.promise)
      .mockResolvedValueOnce(createDashboardDetails(840, 'fresh.example'))
      .mockResolvedValueOnce(createDashboardDetails(960, 'visible.example'));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
        })}
      />,
    );

    expect(getReadingDashboardDetails).toHaveBeenCalledOnce();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('fresh.example');
    expect(container.textContent).toContain('840');

    await act(async () => {
      staleLoad.resolve(createDashboardDetails(120, 'stale.example'));
      await staleLoad.promise;
    });

    expect(container.textContent).toContain('fresh.example');
    expect(container.textContent).not.toContain('stale.example');

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain('visible.example');
    expect(container.textContent).toContain('960');

    await clickButton(findButton(container, '阅读档案'));
    expect(document.activeElement).toBe(container.querySelector('#reading-profile-title'));
    await clickButton(findButton(container, '数据管理'));
    expect(document.activeElement).toBe(container.querySelector('#local-data-title'));
  });

  it('keeps the last successful dashboard data visible when a resume refresh fails', async () => {
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce(createDashboardDetails(840, 'cached.example'))
      .mockRejectedValueOnce(new Error('resume refresh failed'));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
        })}
      />,
    );

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      for (let index = 0; index < 3; index += 1) await Promise.resolve();
    });

    expect(container.textContent).toContain('cached.example');
    expect(container.textContent).toContain('840');
    expect(container.textContent).toContain('刷新失败，当前显示上次成功读取的本地数据。');
    expect(container.querySelector('.dashboard-state')).toBeNull();
  });

  it('renders the popup as a current-site control center first', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
    expect(container.querySelector('.popup-header .yuel-brand')?.getAttribute('role')).toBe('progressbar');
    expect(container.querySelector<HTMLElement>('.popup-header .yuel-brand__mark')?.dataset.state).toBe('complete');
    expect(text).toContain('当前站点');
    expect(text).toContain('今日有效阅读');
    expect(text).toContain('打开侧栏');
    expect(text).toContain('查看仪表盘');
    expect(text.indexOf('当前站点')).toBeLessThan(text.indexOf('已启用网站'));
    expect(container.querySelector('.popup-current-site__detail')?.hasAttribute('aria-live')).toBe(false);
    expect(container.querySelector('.popup-metrics')?.hasAttribute('aria-live')).toBe(false);

    const enabledSitesToggle = container.querySelector<HTMLButtonElement>('.popup-sites__toggle');
    expect(enabledSitesToggle?.getAttribute('aria-controls')).toBeNull();
    await clickButton(enabledSitesToggle ?? undefined);
    expect(enabledSitesToggle?.getAttribute('aria-controls')).toBe('popup-enabled-sites');
  });

  it('renders the side panel around current reading, vocabulary, and highlights', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails: async () => createSidePanelDetails(createDashboardDetails(1540).summary),
        })}
      />,
    );

    expect(container.textContent).toContain('当前阅读');
    expect(container.textContent).toContain('本页内容覆盖');
    expect(container.textContent).toContain('今日');
    expect(container.textContent).toContain('值得关注');
    expect(container.textContent).toContain('摘录');
    expect(container.textContent).not.toContain('Observe');
    expect(container.querySelector<HTMLElement>('.sidepanel-header .yuel-brand__mark')?.dataset.state).toBe('complete');
  });

  it('uses the live collector signal instead of permission alone for the side-panel status', async () => {
    const recording = await renderSidePanelWithAccess({
      supported: true,
      tabId: 1,
      url: 'https://example.com/article',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      enabled: true,
      starterSite: false,
      collectorState: 'recording',
    });
    const idle = await renderSidePanelWithAccess({
      supported: true,
      tabId: 2,
      url: 'https://example.com/zh',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      enabled: true,
      starterSite: false,
      collectorState: 'idle',
    });
    const unconfirmed = await renderSidePanelWithAccess({
      supported: true,
      tabId: 3,
      url: 'https://example.com/loading',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      enabled: true,
      starterSite: false,
    });

    expect(recording.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('记录中');
    expect(idle.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('未检测到英文');
    expect(idle.textContent).toContain('当前页面未检测到可记录的英文内容');
    expect(unconfirmed.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('已启用');
    expect(unconfirmed.textContent).toContain('网站已启用，正在确认页面采集状态');
  });

  it('distinguishes hidden tab metadata from a page that is truly unsupported', async () => {
    const unknown = await renderSidePanelWithAccess({
      supported: false,
      reason: 'tab-unavailable',
    });
    const unsupported = await renderSidePanelWithAccess({
      supported: false,
      reason: 'unsupported-page',
    });

    expect(unknown.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('状态未知');
    expect(unknown.textContent).toContain('暂时无法确认当前页面');
    expect(unknown.textContent).not.toContain('不可记录');
    expect(unsupported.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('不可记录');
    expect(unsupported.textContent).toContain('当前页面无法记录');
  });

  it('renders the dashboard as a progress instrument panel with the danger action demoted', async () => {
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails: async () => ({
            summary: createTodayReadingSummary({
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              streak: 2,
              topDomains: ['developer.mozilla.org'],
              readPages: 2,
              learningWords: 5,
              hasData: true,
            }),
            history: [],
            recentPages: [],
            recentVocabulary: [],
            recentSavedItems: [],
            hasData: true,
          }),
        })}
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
    expect(container.querySelector<HTMLElement>('.dashboard-header .yuel-brand__mark')?.dataset.state).toBe('complete');
  });

  it('renders popup metrics and current-site controls from injected local services', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
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

  it('keeps the popup permission detail consistent when current-site access fails', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createDashboardDetails().summary,
          getCurrentTabSiteAccess: async () => {
            throw new Error('site access unavailable');
          },
          listEnabledSites: async () => [],
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(container.textContent).toContain('权限状态不可用');
    expect(container.textContent).toContain('暂时无法读取当前页面权限状态');
    expect(container.textContent).not.toContain('正在读取当前标签');
  });

  it('does not show popup enabled-sites empty state while persisted sites are loading', async () => {
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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

  it('keeps an action-refreshed popup site list when the initial request resolves last', async () => {
    const initialSites = createDeferred<Awaited<ReturnType<PopupAppDependencies['listEnabledSites']>>>();
    const listEnabledSites = vi
      .fn()
      .mockImplementationOnce(() => initialSites.promise)
      .mockResolvedValueOnce([{ origin: 'https://fresh.example/*', host: 'fresh.example' }]);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createDashboardDetails().summary,
          getCurrentTabSiteAccess: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://current.example/article',
            origin: 'https://current.example/*',
            host: 'current.example',
            granted: false,
            enabled: false,
            starterSite: false,
          }),
          listEnabledSites,
          enableCurrentTabSite: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://current.example/article',
            origin: 'https://current.example/*',
            host: 'current.example',
            granted: true,
            enabled: true,
            starterSite: false,
            injected: true,
          }),
          disableEnabledSite: vi.fn(),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    expect(listEnabledSites).toHaveBeenCalledOnce();
    await clickButton(findButton(container, '启用当前网站'));
    await act(async () => {
      for (let index = 0; index < 4; index += 1) await Promise.resolve();
    });

    expect(listEnabledSites).toHaveBeenCalledTimes(2);
    await clickButton(container.querySelector<HTMLButtonElement>('.popup-sites__toggle') ?? undefined);
    expect(container.querySelector('.popup-sites__list')?.textContent).toContain('fresh.example');

    await act(async () => {
      initialSites.resolve([{ origin: 'https://stale.example/*', host: 'stale.example' }]);
      await initialSites.promise;
    });

    expect(container.querySelector('.popup-sites__list')?.textContent).toContain('fresh.example');
    expect(container.querySelector('.popup-sites__list')?.textContent).not.toContain('stale.example');
  });

  it('opens the side panel companion from the popup action', async () => {
    const openSidePanel = vi.fn(async () => undefined);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
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
        collectorState: 'recording',
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
    const getCurrentTabSiteAccess = vi
      .fn()
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 1,
        url: 'https://example.com/article',
        origin: 'https://example.com/*',
        host: 'example.com',
        granted: true,
        enabled: true,
        starterSite: false,
      })
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 1,
        url: 'https://example.com/article',
        origin: 'https://example.com/*',
        host: 'example.com',
        granted: false,
        enabled: false,
        starterSite: false,
      });
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
            streak: 0,
            topDomains: [],
            readPages: 3,
            learningWords: 9,
            hasData: true,
          }),
          getCurrentTabSiteAccess,
          listEnabledSites: vi
            .fn()
            .mockResolvedValueOnce([{ origin: 'https://example.com/*', host: 'example.com' }])
            .mockResolvedValueOnce([]),
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite,
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    const pauseButton = findButton(container, '暂停记录');
    pauseButton?.focus();
    expect(document.activeElement).toBe(pauseButton);
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
    expect(document.activeElement).toBe(container.querySelector('.popup-sites__toggle'));
    await clickButton(container.querySelector<HTMLButtonElement>('.popup-sites__toggle') ?? undefined);
    expect(container.querySelector('.popup-sites')?.textContent).toContain('还没有手动启用的网站');
    expect(container.querySelector('.popup-sites')?.textContent).not.toContain('example.com');
  });

  it('shows an origin that another context re-enables after a popup pause completes', async () => {
    const currentAccess = {
      supported: true as const,
      tabId: 1,
      url: 'https://example.com/article',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: true,
      enabled: true,
      starterSite: false,
      collectorState: 'recording' as const,
    };
    const listEnabledSites = vi.fn(async () => [{ origin: currentAccess.origin, host: currentAccess.host }]);
    const getCurrentTabSiteAccess = vi.fn(async () => currentAccess);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createDashboardDetails(320).summary,
          getCurrentTabSiteAccess,
          listEnabledSites,
          enableCurrentTabSite: vi.fn(),
          disableEnabledSite: async () => ({ removed: true, remainingOrigins: [] }),
          openDashboard: vi.fn(),
          openSidePanel: vi.fn(),
        }}
      />,
    );

    await clickButton(findButton(container, '暂停记录'));
    await act(async () => {
      for (let index = 0; index < 4; index += 1) await Promise.resolve();
    });

    expect(listEnabledSites).toHaveBeenCalledTimes(2);
    expect(getCurrentTabSiteAccess).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('正在记录此网站的英文阅读');
    await clickButton(container.querySelector<HTMLButtonElement>('.popup-sites__toggle') ?? undefined);
    expect(container.querySelector('.popup-sites__list')?.textContent).toContain('example.com');
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 0,
            minutes: 0,
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
    removeButton?.focus();
    expect(document.activeElement).toBe(removeButton);

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
    expect(document.activeElement).toBe(container.querySelector('.popup-sites__toggle'));
  });

  it('shows when enabled-site removal fails without hiding current-site access', async () => {
    const disableEnabledSite = vi.fn(async () => {
      throw new Error('permission removal failed');
    });
    const listEnabledSites = vi.fn(async () => [{ origin: 'https://example.com/*', host: 'example.com' }]);
    const container = await renderForSmoke(
      <PopupApp
        dependencies={{
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
            collectorState: 'recording',
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
          getTodayReadingSummary: async () => createTodayReadingSummary({
            date: '2026-06-27',
            effectiveWords: 1280,
            minutes: 14,
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
            collectorState: 'recording',
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
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails: async () => ({
            summary: createTodayReadingSummary({
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              streak: 0,
              topDomains: ['developer.mozilla.org'],
              readPages: 2,
              learningWords: 5,
              hasData: true,
            }),
            history: [],
            recentPages: [
              {
                pageId: 'page-1',
                domain: 'developer.mozilla.org',
                totalWords: 1200,
                effectiveWords: 620,
                coveredWords: 620,
                lastReadAt: Date.UTC(2026, 5, 27, 10, 0, 0),
              },
            ],
            recentVocabulary: [
              {
                lemma: 'resilience',
                seenCount: 4,
                effectiveSeenCount: 3,
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
            hasData: true,
          }),
        })}
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
    expect(container.textContent).not.toContain('今日打卡卡片');
    expect(container.textContent).toContain('今日有效阅读');
    expect(container.textContent).toContain('阅读活动热力图');
    expect(container.textContent).toContain('有效阅读趋势');
    expect(container.textContent).toContain('一周节律');
    expect(container.textContent).toContain('输入构成');
    expect(container.querySelectorAll('.reading-heatmap__week')).toHaveLength(13);

    const thirtyDayRange = findButton(container, '30 天');
    const fourteenDayRange = findButton(container, '14 天');
    expect(thirtyDayRange?.getAttribute('aria-pressed')).toBe('true');
    await clickButton(fourteenDayRange);
    expect(fourteenDayRange?.getAttribute('aria-pressed')).toBe('true');

    const pageProgress = container.querySelector<HTMLElement>('[aria-label="developer.mozilla.org 内容覆盖"]');
    expect(pageProgress?.getAttribute('aria-label')).toBe('developer.mozilla.org 内容覆盖');
    expect(pageProgress?.getAttribute('aria-valuemin')).toBe('0');
    expect(pageProgress?.getAttribute('aria-valuenow')).toBe('620');
    expect(pageProgress?.getAttribute('aria-valuemax')).toBe('1200');
    expect(pageProgress?.getAttribute('aria-valuetext')).toBe('620 / 1,200 词');

    await revealTodayCard(container);
  });

  it('keeps sharing locked until the daily goal is reached and saves a user-defined goal', async () => {
    const saveDailyCheckInThresholdWords = vi.fn(async (thresholdWords: number) => thresholdWords);
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce(createDashboardDetails(320))
      .mockResolvedValueOnce({
        ...createDashboardDetails(320),
        summary: {
          ...createDashboardDetails(320).summary,
          checkInThresholdWords: 900,
          checkInCompleted: false,
        },
      });
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
          saveDailyCheckInThresholdWords,
        })}
      />,
    );

    const lockedShareButton = findButton(container, '达标后可打卡');
    expect(lockedShareButton?.disabled).toBe(true);
    expect(container.textContent).toContain('今日未达标');
    expect(container.textContent).toContain('再读 180 个有效词');
    expect(container.textContent).not.toContain('今日打卡卡片');

    const checkInProgress = container.querySelector<HTMLElement>('[aria-label="今日打卡进度"]');
    expect(checkInProgress?.getAttribute('aria-valuenow')).toBe('320');
    expect(checkInProgress?.getAttribute('aria-valuemax')).toBe('500');
    expect(checkInProgress?.getAttribute('aria-valuetext')).toBe('还差 180 词完成今日打卡');

    await clickButton(findButton(container, '调整目标'));
    const goalInput = container.querySelector<HTMLInputElement>('#daily-check-in-threshold');
    expect(goalInput).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      if (!goalInput) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(goalInput, '900');
      goalInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickButton(findButton(container, '保存目标'));

    expect(saveDailyCheckInThresholdWords).toHaveBeenCalledWith(900);
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('900 词 / 天');
    expect(container.textContent).toContain('打卡目标已保存，连续记录已重新计算。');
  });

  it('keeps the side-panel card action locked before the daily goal is reached', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails: async () => createSidePanelDetails(createDashboardDetails(320).summary),
        })}
      />,
    );

    const cardButton = findButton(container, '达标后可打卡');
    expect(cardButton?.disabled).toBe(true);
    expect(cardButton?.title).toBe('还差 180 词完成今日打卡');
  });

  it('saves dashboard onboarding reading pace calibration', async () => {
    const saveResult = createDeferred<
      Awaited<ReturnType<DashboardAppDependencies['saveOnboardingReadingPaceCalibration']>>
    >();
    const saveOnboardingReadingPaceCalibration = vi.fn<DashboardAppDependencies['saveOnboardingReadingPaceCalibration']>(
      () => saveResult.promise,
    );
    const stalePaceRefresh = createDeferred<
      Awaited<ReturnType<DashboardAppDependencies['getReadingPaceSummary']>>
    >();
    const getReadingPaceSummary = vi
      .fn()
      .mockResolvedValueOnce({
        language: 'en',
        contentType: 'general',
        baseWordsPerMinute: 220,
        sampleCount: 0,
        source: 'default',
        hasProfile: false,
      })
      .mockImplementationOnce(() => stalePaceRefresh.promise);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingPaceSummary,
          saveOnboardingReadingPaceCalibration,
        })}
      />,
    );

    const startButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '开始校准');
    expect(startButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('我已读完');
    expect(container.querySelector('article.calibration-passage')?.getAttribute('lang')).toBe('en');
    expect(document.activeElement).toBe(container.querySelector('#pace-calibration-reading-title'));

    nowSpy.mockReturnValue(61_000);
    const finishedButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '我已读完');
    await act(async () => {
      finishedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.activeElement).toBe(container.querySelector('#pace-calibration-questions-title'));

    for (const label of ['Duplicating visible paragraphs', 'When answers are solid', 'High confidence real-page samples']) {
      const optionLabel = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent === label);
      const optionInput = optionLabel?.querySelector<HTMLInputElement>('input[type="radio"]');
      expect(optionInput).toBeInstanceOf(HTMLInputElement);
      await act(async () => {
        optionInput?.click();
      });
      expect(optionInput?.checked).toBe(true);
    }
    expect(container.querySelector('#pace-calibration')?.getAttribute('lang')).toBeNull();
    expect(container.querySelector('.calibration-flow__heading > div')?.getAttribute('lang')).toBe('en');
    expect(container.querySelector('.calibration-questions')?.getAttribute('lang')).toBe('en');
    expect(findButton(container, '取消')?.closest('[lang="en"]')).toBeNull();
    expect(findButton(container, '保存校准')?.closest('[lang="en"]')).toBeNull();

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
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(getReadingPaceSummary).toHaveBeenCalledTimes(2);

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
    await act(async () => {
      stalePaceRefresh.resolve({
        language: 'en',
        contentType: 'general',
        baseWordsPerMinute: 180,
        sampleCount: 0,
        source: 'default',
        hasProfile: false,
      });
      await stalePaceRefresh.promise;
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
    expect(document.activeElement).toBe(container.querySelector('#pace-calibration-trigger'));

    await clickButton(findButton(container, '重新校准'));
    await clickButton(container.querySelector<HTMLButtonElement>('button[aria-label="取消校准"]') ?? undefined);
    expect(document.activeElement).toBe(container.querySelector('#pace-calibration-trigger'));

    nowSpy.mockRestore();
  });

  it('keeps an in-flight dashboard details load valid when pace calibration is saved', async () => {
    const pendingDetails = createDeferred<ReturnType<typeof createDashboardDetails>>();
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails: () => pendingDetails.promise,
          getReadingPaceSummary: async () => ({
            language: 'en',
            contentType: 'general',
            baseWordsPerMinute: 220,
            sampleCount: 0,
            source: 'default',
            hasProfile: false,
          }),
          saveOnboardingReadingPaceCalibration: async () => ({
            language: 'en',
            contentType: 'general',
            baseWordsPerMinute: 230,
            sampleCount: 0,
            source: 'onboarding',
            hasProfile: true,
          }),
        })}
      />,
    );

    await clickButton(findButton(container, '开始校准'));
    await clickButton(findButton(container, '我已读完'));
    for (const fieldset of container.querySelectorAll('fieldset')) {
      await act(async () => {
        fieldset.querySelector<HTMLInputElement>('input[type="radio"]')?.click();
      });
    }
    await clickButton(findButton(container, '保存校准'));

    await act(async () => {
      pendingDetails.resolve(createDashboardDetails());
      await pendingDetails.promise;
    });

    expect(container.textContent).toContain('从下一篇外语文章开始');
    expect(container.querySelector('main')?.getAttribute('aria-busy')).toBe('false');
  });

  it('keeps the dashboard error state exclusive and retries into the empty state', async () => {
    const getReadingDashboardDetails = vi
      .fn()
      .mockRejectedValueOnce(new Error('details unavailable'))
      .mockResolvedValueOnce(createDashboardDetails());
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
        })}
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
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails: () => new Promise(() => undefined),
        })}
      />,
    );

    expect(container.textContent).toContain('正在读取本地数据');
    expect(container.textContent).not.toContain('本地数据不可用');
    expect(container.textContent).not.toContain('从下一篇外语文章开始');
    expect(container.textContent).not.toContain('今日有效阅读');
    expect(container.textContent).not.toContain('还没有阅读记录。');
    expect(container.textContent).not.toContain('还没有词汇记录。');
    expect(container.textContent).not.toContain('还没有保存摘录。');
  });

  it('copies the dashboard share card text through injected clipboard service', async () => {
    const copyTextToClipboard = vi.fn(async () => undefined);
    const expectedCopyText =
      '阅量 · 今日英文阅读 · 2026-06-27\n'
      + '今天计入 960 Words\n'
      + '连续打卡：4 天\n'
      + '阅读时间：11 分钟\n'
      + '页面：2 页\n'
      + '学习中词汇：5 个\n'
      + '今日网站：developer.mozilla.org';
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          copyTextToClipboard,
          getReadingDashboardDetails: async () => ({
            summary: createTodayReadingSummary({
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              streak: 4,
              topDomains: ['developer.mozilla.org'],
              readPages: 2,
              learningWords: 5,
              hasData: true,
            }),
            history: [],
            recentPages: [],
            recentVocabulary: [],
            recentSavedItems: [],
            hasData: true,
          }),
        })}
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

    expect(copyTextToClipboard).toHaveBeenCalledWith(expectedCopyText);
    expect(container.textContent).toContain('已复制');
  });

  it('lets the user tune the compact website list and keeps copied content in sync', async () => {
    const copyTextToClipboard = vi.fn(async () => undefined);
    const saveShareCardSettings = vi.fn<DashboardAppDependencies['saveShareCardSettings']>(
      async (settings) => settings,
    );
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          copyTextToClipboard,
          getReadingDashboardDetails: async () => ({
            summary: createTodayReadingSummary({
              date: '2026-06-27',
              effectiveWords: 960,
              minutes: 11,
              streak: 12,
              topDomains: ['developer.mozilla.org', 'web.dev', 'react.dev'],
              readPages: 4,
              learningWords: 5,
              hasData: true,
            }),
            history: [],
            recentPages: [],
            recentVocabulary: [],
            recentSavedItems: [],
            hasData: true,
          }),
          getShareCardSettings: async () => ({
            theme: 'forest',
            siteLimit: 3,
            showSiteIcons: true,
            showStreak: true,
          }),
          saveShareCardSettings,
        })}
      />,
    );

    await revealTodayCard(container);
    const activeCard = () => container.querySelector<HTMLElement>(
      '.share-carousel__slide:not([aria-hidden="true"]) .share-card-preview',
    );
    expect(activeCard()?.querySelectorAll('.share-card-preview__sites li')).toHaveLength(3);
    expect(activeCard()?.querySelectorAll('.share-card-preview__site-icon')).toHaveLength(3);
    expect(activeCard()?.querySelector('[aria-label="连续打卡 12 天"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[name="share-card-site-limit"][value="2"]')?.click();
    });
    expect(activeCard()?.querySelectorAll('.share-card-preview__sites li')).toHaveLength(2);

    const iconToggle = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .find((input) => input.closest('label')?.textContent?.includes('网站图标'));
    const streakToggle = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .find((input) => input.closest('label')?.textContent?.includes('连续天数'));
    await act(async () => iconToggle?.click());
    await act(async () => streakToggle?.click());

    expect(activeCard()?.querySelector('.share-card-preview__site-icon')).toBeNull();
    expect(activeCard()?.querySelector('.share-card-preview__site-list--plain')).not.toBeNull();
    expect(activeCard()?.querySelector('[aria-label^="连续打卡"]')).toBeNull();
    expect(saveShareCardSettings).toHaveBeenLastCalledWith({
      theme: 'forest',
      siteLimit: 2,
      showSiteIcons: false,
      showStreak: false,
    });

    await clickButton(findButton(container, '复制文案'));
    expect(copyTextToClipboard).toHaveBeenCalledWith(
      '阅量 · 今日英文阅读 · 2026-06-27\n'
      + '今天计入 960 Words\n'
      + '阅读时间：11 分钟\n'
      + '页面：4 页\n'
      + '学习中词汇：5 个\n'
      + '今日网站：developer.mozilla.org、web.dev',
    );
  });

  it('switches the static card carousel and exports the selected style as a PNG', async () => {
    const exportSummaryCardPng = vi.fn<DashboardAppDependencies['exportSummaryCardPng']>(
      async () => undefined,
    );
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          exportSummaryCardPng,
          getReadingDashboardDetails: async () => createDashboardDetails(960, 'developer.mozilla.org'),
        })}
      />,
    );

    await revealTodayCard(container);
    const themeInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[name="share-card-theme"]'),
    );
    expect(themeInputs.map((input) => input.value)).toEqual(['forest', 'mist', 'midnight', 'berry']);
    expect(themeInputs.find((input) => input.value === 'forest')?.checked).toBe(true);
    expect(container.querySelector('.share-carousel__slide:not([aria-hidden="true"]) .share-card-preview')?.getAttribute('data-card-theme'))
      .toBe('forest');

    await clickButton(container.querySelector<HTMLButtonElement>('button[aria-label="下一种卡片样式"]') ?? undefined);
    expect(themeInputs.find((input) => input.value === 'mist')?.checked).toBe(true);
    expect(container.querySelector('.share-carousel__caption strong')?.textContent).toBe('雾白');

    await act(async () => {
      themeInputs.find((input) => input.value === 'berry')?.click();
    });
    expect(themeInputs.find((input) => input.value === 'berry')?.checked).toBe(true);
    expect(container.querySelector('.share-carousel__slide:not([aria-hidden="true"]) .share-card-preview')?.getAttribute('data-card-theme'))
      .toBe('berry');

    const downloadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '下载 PNG');
    expect(downloadButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(exportSummaryCardPng).toHaveBeenCalledWith(expect.any(HTMLElement), 'yuel-reading-2026-06-27-berry.png');
    expect((exportSummaryCardPng.mock.calls[0]?.[0] as HTMLElement).dataset.cardTheme).toBe('berry');
    expect(container.textContent).toContain('已下载');
  });

  it('clears local dashboard data through injected services', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce(createDashboardDetails(960, 'developer.mozilla.org'))
      .mockResolvedValueOnce(createDashboardDetails());
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
          clearLocalReadingData,
        })}
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
      .mockResolvedValueOnce(createDashboardDetails(960, 'developer.mozilla.org'))
      .mockResolvedValueOnce(createDashboardDetails());
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
          clearLocalReadingData,
          copyTextToClipboard,
        })}
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
    expect(container.textContent).not.toContain('今日打卡卡片');
    expect(container.textContent).not.toContain('查看今日卡片');
    expect(container.textContent).not.toContain('复制文案');
    expect(container.textContent).not.toContain('下载 PNG');
    expect(container.textContent).not.toContain('已复制');
  });

  it('shows a clear failure without refreshing dashboard data', async () => {
    const clearLocalReadingData = vi.fn(async () => {
      throw new Error('clear failed');
    });
    const getReadingDashboardDetails = vi.fn(async () => createDashboardDetails(960, 'developer.mozilla.org'));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
          clearLocalReadingData,
        })}
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
      .mockResolvedValueOnce(createDashboardDetails(960, 'developer.mozilla.org'))
      .mockRejectedValueOnce(new Error('refresh failed'));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
          clearLocalReadingData,
        })}
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
    const getReadingDashboardDetails = vi.fn(async () => createDashboardDetails(960, 'developer.mozilla.org'));
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={createDashboardDependencies({
          getReadingDashboardDetails,
          clearLocalReadingData,
          confirmClearLocalReadingData: () => false,
        })}
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

  it('uses the focused side-panel snapshot and merges overlapping refresh requests', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const initialDetails = createDeferred<ReturnType<typeof createDashboardDetails>>();
    const getSidePanelReadingDetails = vi
      .fn()
      .mockImplementationOnce(() => initialDetails.promise)
      .mockResolvedValueOnce(createDashboardDetails(740, 'latest.example'));
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
        })}
      />,
    );

    expect(getSidePanelReadingDetails).toHaveBeenCalledOnce();

    await act(async () => {
      requestRefresh?.('tick');
      requestRefresh?.('resume');
      requestRefresh?.('tick');
      await Promise.resolve();
    });
    expect(getSidePanelReadingDetails).toHaveBeenCalledOnce();

    await act(async () => {
      initialDetails.resolve(createDashboardDetails(520, 'initial.example'));
      await initialDetails.promise;
      for (let index = 0; index < 6; index += 1) {
        await Promise.resolve();
      }
    });

    expect(getSidePanelReadingDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('740 词');
    expect(container.querySelector('.sidepanel-page__measure')?.hasAttribute('aria-live')).toBe(false);
  });

  it('asks for a tab refresh when side panel enablement succeeds but current-page injection misses', async () => {
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
      <SidePanelApp
        dependencies={createSidePanelDependencies({
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
        })}
      />,
    );

    await clickButton(findButton(container, '启用当前网站'));

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('待刷新');
    expect(container.textContent).toContain('已为后续页面启用；刷新当前标签后开始记录');
    expect(container.textContent).not.toContain('记录中');
  });

  it('clears stale side panel host and page metrics while navigation access is pending', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const nextAccess = createDeferred<
      Awaited<ReturnType<SidePanelAppDependencies['getCurrentTabSiteAccess']>>
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
            coveredWords: 420,
            effectiveMinutes: 5,
            confidence: 0.72,
            hasData: true,
          }
        : {
            pageId: 'old',
            domain: 'old.example',
            totalWords: 1000,
            effectiveWords: 345,
            coveredWords: 345,
            effectiveMinutes: 4,
            confidence: 0.6,
            hasData: true,
          }
    ));
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getCurrentTabSiteAccess,
          getCurrentPageReadingSummary,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
        })}
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
      Awaited<ReturnType<SidePanelAppDependencies['getCurrentTabSiteAccess']>>
    >();
    const stalePage = createDeferred<
      Awaited<ReturnType<SidePanelAppDependencies['getCurrentPageReadingSummary']>>
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
      })
      .mockResolvedValue({
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
              coveredWords: 420,
              effectiveMinutes: 5,
              confidence: 0.75,
              hasData: true,
            }
          : {
              pageId: 'initial',
              domain: 'initial.example',
              totalWords: 100,
              effectiveWords: 10,
              coveredWords: 10,
              effectiveMinutes: 1,
              confidence: 0.5,
              hasData: true,
            },
      );
    });
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getCurrentTabSiteAccess,
          getCurrentPageReadingSummary,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
        })}
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
      requestRefresh?.('tick');
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(getCurrentTabSiteAccess).toHaveBeenCalledTimes(4);

    await act(async () => {
      stalePage.resolve({
        pageId: 'stale',
        domain: 'stale.example',
        totalWords: 900,
        effectiveWords: 777,
        coveredWords: 777,
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
    expect(container.querySelector('.sidepanel-page [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('420');
  });

  it('refreshes side panel totals and current-page context when the active tab changes', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const unsubscribe = vi.fn();
    const getSidePanelReadingDetails = vi
      .fn()
      .mockResolvedValueOnce(createSidePanelDetails(createDashboardDetails(600, 'first.example').summary))
      .mockResolvedValueOnce(createSidePanelDetails(createDashboardDetails(1540, 'second.example').summary));
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
            coveredWords: 420,
            effectiveMinutes: 5,
            confidence: 0.72,
            hasData: true,
          }
        : {
            pageId: 'first',
            domain: 'first.example',
            totalWords: 1000,
            effectiveWords: 100,
            coveredWords: 100,
            effectiveMinutes: 1,
            confidence: 0.5,
            hasData: true,
          }
    ));
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails,
          getCurrentTabSiteAccess,
          getCurrentPageReadingSummary,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return unsubscribe;
          },
        })}
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

    expect(getSidePanelReadingDetails).toHaveBeenCalledTimes(2);
    expect(getCurrentTabSiteAccess).toHaveBeenCalledTimes(2);
    expect(getCurrentPageReadingSummary).toHaveBeenLastCalledWith('https://second.example/guide');
    expect(container.textContent).toContain('second.example');
    expect(container.textContent).toContain('1,540 词');
    expect(container.textContent).toContain('420 / 1,200 词');
    expect(container.querySelector('.sidepanel-page [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('420');
  });

  it('keeps the side panel enable action stable and single-shot while permission is pending', async () => {
    const enableResult = createDeferred<Awaited<ReturnType<SidePanelAppDependencies['enableCurrentTabSite']>>>();
    const enableCurrentTabSite = vi.fn(() => enableResult.promise);
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
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
        })}
      />,
    );

    const pendingEnableButton = findButton(container, '启用当前网站');
    pendingEnableButton?.focus();
    await clickButton(pendingEnableButton);

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
        collectorState: 'recording',
        injected: true,
      });
      await enableResult.promise;
    });

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('记录中');
    expect(container.textContent).not.toContain('启用当前网站');
    expect(document.activeElement).toBe(container.querySelector('#current-reading-title'));
  });

  it('releases a hung side-panel refresh when an enable action takes ownership', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const staleDetails = createDeferred<SidePanelDetails>();
    const getSidePanelReadingDetails = vi
      .fn()
      .mockImplementationOnce(() => staleDetails.promise)
      .mockResolvedValue(createSidePanelDetails(createDashboardDetails(320, 'fresh.example').summary));
    const getCurrentTabSiteAccess = vi.fn(async () => ({
      supported: true as const,
      tabId: 1,
      url: 'https://example.com/article',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: false,
      enabled: false,
      starterSite: false,
    }));
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails,
          getCurrentTabSiteAccess,
          enableCurrentTabSite: async () => ({
            supported: true,
            tabId: 1,
            url: 'https://example.com/article',
            origin: 'https://example.com/*',
            host: 'example.com',
            granted: true,
            enabled: true,
            starterSite: false,
            injected: true,
          }),
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
        })}
      />,
    );

    expect(getSidePanelReadingDetails).toHaveBeenCalledOnce();
    await clickButton(findButton(container, '启用当前网站'));
    await act(async () => {
      requestRefresh?.('tick');
      for (let index = 0; index < 4; index += 1) await Promise.resolve();
    });

    expect(getSidePanelReadingDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('320 词');

    await act(async () => {
      staleDetails.resolve(createSidePanelDetails());
      await staleDetails.promise;
    });
  });

  it('does not let a delayed enable page query overwrite a newer side-panel refresh', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const delayedEnablePage = createDeferred<
      Awaited<ReturnType<SidePanelAppDependencies['getCurrentPageReadingSummary']>>
    >();
    const currentAccess = {
      supported: true as const,
      tabId: 1,
      url: 'https://example.com/article',
      origin: 'https://example.com/*',
      host: 'example.com',
      granted: false,
      enabled: false,
      starterSite: false,
    };
    const getCurrentPageReadingSummary = vi
      .fn()
      .mockResolvedValueOnce({
        pageId: 'initial',
        domain: 'example.com',
        totalWords: 100,
        effectiveWords: 10,
        coveredWords: 10,
        effectiveMinutes: 1,
        confidence: 0.5,
        hasData: true,
      })
      .mockImplementationOnce(() => delayedEnablePage.promise)
      .mockResolvedValueOnce({
        pageId: 'fresh',
        domain: 'example.com',
        totalWords: 1_200,
        effectiveWords: 420,
        coveredWords: 420,
        effectiveMinutes: 4,
        confidence: 0.8,
        hasData: true,
      });
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails: async () => createSidePanelDetails(createDashboardDetails(420).summary),
          getCurrentTabSiteAccess: async () => currentAccess,
          getCurrentPageReadingSummary,
          enableCurrentTabSite: async () => ({
            ...currentAccess,
            granted: true,
            enabled: true,
            injected: true,
          }),
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
        })}
      />,
    );

    await clickButton(findButton(container, '启用当前网站'));
    expect(getCurrentPageReadingSummary).toHaveBeenCalledTimes(2);

    await act(async () => {
      requestRefresh?.('tick');
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(getCurrentPageReadingSummary).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain('420 / 1,200 词');

    await act(async () => {
      delayedEnablePage.resolve({
        pageId: 'stale-enable',
        domain: 'example.com',
        totalWords: 200,
        effectiveWords: 20,
        coveredWords: 20,
        effectiveMinutes: 1,
        confidence: 0.4,
        hasData: true,
      });
      await delayedEnablePage.promise;
    });

    expect(container.textContent).toContain('420 / 1,200 词');
    expect(container.textContent).not.toContain('20 / 200 词');
  });

  it('ignores a pending enable result after the active tab changes', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const enableResult = createDeferred<Awaited<ReturnType<SidePanelAppDependencies['enableCurrentTabSite']>>>();
    const getCurrentTabSiteAccess = vi
      .fn()
      .mockResolvedValueOnce({
        supported: true as const,
        tabId: 1,
        url: 'https://first.example/article',
        origin: 'https://first.example/*',
        host: 'first.example',
        granted: false,
        enabled: false,
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
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getCurrentTabSiteAccess,
          enableCurrentTabSite: () => enableResult.promise,
          subscribeToRefresh: (refresh) => {
            requestRefresh = refresh;
            return vi.fn();
          },
        })}
      />,
    );

    await clickButton(findButton(container, '启用当前网站'));
    await act(async () => {
      requestRefresh?.('tab');
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(container.textContent).toContain('second.example');

    await act(async () => {
      enableResult.resolve({
        supported: true,
        tabId: 1,
        url: 'https://first.example/article',
        origin: 'https://first.example/*',
        host: 'first.example',
        granted: true,
        enabled: true,
        starterSite: false,
        injected: true,
      });
      await enableResult.promise;
    });

    expect(container.textContent).toContain('second.example');
    expect(container.textContent).not.toContain('first.example');
    expect(container.textContent).not.toContain('启用中...');
  });

  it('renders side panel companion metrics from injected local services', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails: async () => createSidePanelDetails({
            effectiveWords: 1540,
            minutes: 18,
            readPages: 4,
            hasData: true,
          }),
        })}
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
        dependencies={createSidePanelDependencies()}
      />,
    );

    expect(container.textContent).toContain('阅读时间0 分钟');
    expect(container.textContent).not.toContain('阅读时间不足 1 分钟');
  });

  it('does not show side panel top-domain empty state while local summary is loading', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails: () => new Promise(() => undefined),
        })}
      />,
    );

    expect(container.textContent).toContain('读取中');
    expect(container.textContent).not.toContain('暂无当前网站');
  });

  it('shows unavailable side panel metrics when local reading stats fail to load', async () => {
    const container = await renderForSmoke(
      <SidePanelApp
        dependencies={createSidePanelDependencies({
          getSidePanelReadingDetails: async () => {
            throw new Error('stats unavailable');
          },
        })}
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
        dependencies={createSidePanelDependencies({
          openDashboard,
        })}
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
        dependencies={createSidePanelDependencies({
          openDashboard,
        })}
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
