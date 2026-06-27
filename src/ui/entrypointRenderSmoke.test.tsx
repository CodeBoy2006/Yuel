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
        }}
      />,
    );

    expect(container.textContent).toContain('Yuel Reading');
    expect(container.textContent).toContain('1,280 words');
    expect(container.textContent).toContain('14 min read');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('Enabled');
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
                savedCount: 0,
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
        }}
      />,
    );

    expect(container.textContent).toContain('Local reading dashboard');
    expect(container.textContent).toContain('960');
    expect(container.textContent).toContain('developer.mozilla.org');
    expect(container.textContent).toContain('resilience');
    expect(container.textContent).toContain('architecture');
    expect(container.textContent).toContain('fail gracefully under pressure');
    expect(container.textContent).toContain('Saved selections');
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
        }}
      />,
    );

    expect(container.textContent).toContain('Reading companion');
    expect(container.textContent).toContain('1,540 words');
    expect(container.textContent).toContain('18 min read');
    expect(container.textContent).toContain('4 pages');
    expect(container.textContent).toContain('docs.example.com');
  });
});
