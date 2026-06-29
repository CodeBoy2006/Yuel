import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';

import { DashboardApp, type DashboardAppDependencies } from '../../entrypoints/dashboard/App';
import { PopupApp } from '../../entrypoints/popup/App';
import { SidePanelApp } from '../../entrypoints/sidepanel/App';
import { renderForSmoke } from './renderTest';

describe('extension UI entrypoint smoke rendering', () => {
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
    expect(text).toContain('今日卡片预览');
    expect(text).toContain('阅读趋势');
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
    expect(container.textContent).toContain('1,280 words');
    expect(container.textContent).toContain('14 min');
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

    expect(container.textContent).toContain('0 min');
    expect(container.textContent).not.toContain('<1 min');
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

    const currentSiteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '默认记录中' || button.textContent === '启用当前网站',
    );
    expect(disableEnabledSite).toHaveBeenCalledWith('https://developer.mozilla.org/*');
    expect(currentSiteButton?.textContent).toBe('默认记录中');
    expect(container.textContent).toContain('默认记录站点');
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
    expect(container.textContent).toContain('Saved 2');
    expect(container.textContent).toContain('architecture');
    expect(container.textContent).toContain('fail gracefully under pressure');
    expect(container.textContent).toContain('保存摘录');
    expect(container.textContent).toContain('今日卡片预览');
    expect(container.textContent).toContain('今日有效阅读');
  });

  it('saves dashboard onboarding reading pace calibration', async () => {
    const saveOnboardingReadingPaceCalibration = vi.fn<NonNullable<DashboardAppDependencies['saveOnboardingReadingPaceCalibration']>>(
      async () => ({
      language: 'en',
      contentType: 'general' as const,
      baseWordsPerMinute: 233,
      sampleCount: 0,
      source: 'onboarding' as const,
      updatedAt: 61_000,
      hasProfile: true,
    }),
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

    nowSpy.mockReturnValue(61_000);
    const finishedButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '我已读完');
    await act(async () => {
      finishedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    for (const label of ['Duplicating visible paragraphs', 'When answers are solid', 'High confidence real-page samples']) {
      const optionButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === label);
      expect(optionButton).toBeInstanceOf(HTMLButtonElement);
      await act(async () => {
        optionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存校准');
    expect(saveButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
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

  it('shows unavailable dashboard metrics when local reading details fail to load', async () => {
    const container = await renderForSmoke(
      <DashboardApp
        dependencies={{
          clearLocalReadingData: vi.fn(),
          confirmClearLocalReadingData: () => true,
          getReadingDashboardDetails: async () => {
            throw new Error('details unavailable');
          },
        }}
      />,
    );

    expect(container.textContent).toContain('本地数据不可用');
    expect(container.textContent).toContain('今日有效阅读不可用');
    expect(container.textContent).toContain('阅读时间不可用');
    expect(container.textContent).toContain('今日页面不可用');
    expect(container.textContent).toContain('学习中词汇不可用');
    expect(container.textContent).not.toContain('正在读取本地数据');
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
    expect(container.textContent).toContain('还没有阅读数据');
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
    expect(container.textContent).toContain('还没有阅读数据');
    expect(container.textContent).toContain('复制文案');
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
    expect(container.textContent).toContain('1,540 words');
    expect(container.textContent).toContain('18 min');
    expect(container.textContent).toContain('4 pages');
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
    expect(container.textContent).toContain('阅读时间0 min');
    expect(container.textContent).not.toContain('阅读时间<1 min');
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
