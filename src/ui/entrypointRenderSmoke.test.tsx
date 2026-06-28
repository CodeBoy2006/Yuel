import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';

import { DashboardApp } from '../../entrypoints/dashboard/App';
import { PopupApp } from '../../entrypoints/popup/App';
import { SidePanelApp } from '../../entrypoints/sidepanel/App';
import { renderForSmoke } from './renderTest';

describe('extension UI entrypoint smoke rendering', () => {
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

    expect(container.textContent).toContain('Yuel Reading');
    expect(container.textContent).toContain('1,280 words');
    expect(container.textContent).toContain('14 min read');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('Enabled');
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

    expect(container.textContent).toContain('0 min read');
    expect(container.textContent).not.toContain('<1 min read');
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

    expect(container.textContent).toContain('TodayUnavailable');
    expect(container.textContent).toContain('TimeUnavailable');
    expect(container.textContent).toContain('PagesUnavailable');
    expect(container.textContent).toContain('LearningUnavailable');
    expect(container.textContent).toContain('Local data unavailable');
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

    const sidePanelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open side panel');
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

    const dashboardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open dashboard');
    expect(dashboardButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      dashboardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(openDashboard).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Dashboard unavailable');
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

    const enableButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Enable current site');
    expect(enableButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      enableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Permission was not granted');
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

    const enableButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Enable current site');
    expect(enableButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      enableButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(enableCurrentTabSite).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Enabled for future pages; reload this tab to start tracking');
    expect(container.textContent).not.toContain('Yuel can collect reading events on this site');
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
    expect(container.textContent).toContain('Starter site tracked by default');
    expect(container.textContent).toContain('Enabled');
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

    const removeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Remove');
    expect(removeButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const currentSiteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Enabled' || button.textContent === 'Enable current site',
    );
    expect(disableEnabledSite).toHaveBeenCalledWith('https://developer.mozilla.org/*');
    expect(currentSiteButton?.textContent).toBe('Enabled');
    expect(container.textContent).toContain('Starter site tracked by default');
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

    const removeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Remove');
    expect(removeButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(disableEnabledSite).toHaveBeenCalledWith('https://example.com/*');
    expect(listEnabledSites).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Remove failed; site is still enabled.');
    expect(container.textContent).toContain('Yuel can collect reading events on this site');
    expect(container.textContent).not.toContain('Permission status unavailable');
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
    expect(container.textContent).toContain('Enabled sites unavailable');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('Yuel can collect reading events on this site');
    expect(container.textContent).not.toContain('Permission status unavailable');
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

    expect(container.textContent).toContain('Local reading dashboard');
    expect(container.textContent).toContain('960');
    expect(container.textContent).toContain('developer.mozilla.org');
    expect(container.textContent).toContain('resilience');
    expect(container.textContent).toContain('Saved 2');
    expect(container.textContent).toContain('architecture');
    expect(container.textContent).toContain('fail gracefully under pressure');
    expect(container.textContent).toContain('Saved selections');
    expect(container.textContent).toContain('Share card');
    expect(container.textContent).toContain('Effective words: 960');
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

    expect(container.textContent).toContain('Local data unavailable');
    expect(container.textContent).toContain('Effective wordsUnavailable');
    expect(container.textContent).toContain('Reading timeUnavailable');
    expect(container.textContent).toContain('Pages todayUnavailable');
    expect(container.textContent).toContain('Learning wordsUnavailable');
    expect(container.textContent).not.toContain('Loading local data');
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

    expect(container.textContent).toContain('Loading local data');
    expect(container.textContent).not.toContain('No pages have been tracked yet.');
    expect(container.textContent).not.toContain('No vocabulary exposure recorded yet.');
    expect(container.textContent).not.toContain('No saved selections yet.');
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

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Copy card text');
    expect(copyButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith(summaryCardText);
    expect(container.textContent).toContain('Copied');
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

    const downloadButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Download PNG');
    expect(downloadButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(exportSummaryCardPng).toHaveBeenCalledWith(expect.any(HTMLElement), 'yuel-reading-2026-06-27.png');
    expect(container.textContent).toContain('Downloaded');
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

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Clear local data');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('No reading data yet');
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

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Copy card text');
    expect(copyButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Copied');

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Clear local data');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('No reading data yet');
    expect(container.textContent).toContain('Copy card text');
    expect(container.textContent).not.toContain('Copied');
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

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Clear local data');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Clear failed; local data was not changed.');
    expect(container.textContent).toContain('Effective words: 960');
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

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Clear local data');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Local data unavailable');
    expect(container.textContent).toContain('Local data cleared, but dashboard refresh failed.');
    expect(container.textContent).not.toContain('Clear failed; local data was not changed.');
    expect(container.textContent).not.toContain('Effective words: 960');
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

    const clearButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Clear local data');
    expect(clearButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearLocalReadingData).not.toHaveBeenCalled();
    expect(getReadingDashboardDetails).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Reading data loaded');
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

    expect(container.textContent).toContain('Reading companion');
    expect(container.textContent).toContain('1,540 words');
    expect(container.textContent).toContain('18 min read');
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

    expect(container.textContent).toContain('No reading data yet');
    expect(container.textContent).toContain('TimeNo data');
    expect(container.textContent).not.toContain('Time0 min read');
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

    expect(container.textContent).toContain('Local data unavailable');
    expect(container.textContent).toContain('TodayUnavailable');
    expect(container.textContent).toContain('TimeUnavailable');
    expect(container.textContent).toContain('PagesUnavailable');
    expect(container.textContent).toContain('LearningUnavailable');
    expect(container.textContent).toContain('Top domainUnavailable');
    expect(container.textContent).not.toContain('No top domain yet');
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

    const dashboardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open dashboard');
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

    const dashboardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open dashboard');
    expect(dashboardButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      dashboardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(openDashboard).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Dashboard unavailable');
  });
});
