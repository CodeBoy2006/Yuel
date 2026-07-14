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

async function flushReactMicrotasks(rounds = 1) {
  await act(async () => {
    for (let index = 0; index < rounds; index += 1) await Promise.resolve();
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
    }],
    readingSessions: [],
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

type SupportedSiteAccess = Extract<
  Awaited<ReturnType<PopupAppDependencies['getCurrentTabSiteAccess']>>,
  { supported: true }
>;
type ReadingPaceSummaryFixture = Awaited<ReturnType<DashboardAppDependencies['getReadingPaceSummary']>>;

function createSupportedSiteAccess(
  overrides: Partial<SupportedSiteAccess> = {},
): SupportedSiteAccess {
  return {
    supported: true,
    tabId: 1,
    url: 'https://example.com/article',
    origin: 'https://example.com/*',
    host: 'example.com',
    granted: true,
    globalRecordingEnabled: true,
    siteRecordingEnabled: true,
    enabled: true,
    ...overrides,
  };
}

function createReadingPaceSummary(overrides: Partial<ReadingPaceSummaryFixture> = {}): ReadingPaceSummaryFixture {
  return {
    language: 'en',
    contentType: 'general',
    baseWordsPerMinute: 220,
    sampleCount: 0,
    source: 'default',
    hasProfile: false,
    ...overrides,
  };
}

function createPopupDependencies(
  overrides: Partial<PopupAppDependencies> = {},
): PopupAppDependencies {
  return {
    getTodayReadingSummary: async () => createTodayReadingSummary(),
    getCurrentTabSiteAccess: async () => createSupportedSiteAccess(),
    setSiteReadingRecordingEnabled: async (_url, enabled) => ({
      recordingEnabled: true,
      excludedSiteDomains: enabled ? [] : ['example.com'],
    }),
    openDashboard: async () => undefined,
    openPdfReader: async () => undefined,
    openSidePanel: async () => undefined,
    ...overrides,
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
    getReadingPaceSummary: async () => createReadingPaceSummary(),
    getReadingRecordingSettings: async () => ({
      recordingEnabled: true,
      excludedSiteDomains: [],
    }),
    getReadingToolbarSettings: async () => ({
      progressIconEnabled: true,
    }),
    getShareCardSettings: async () => ({
      theme: 'forest',
      siteLimit: 3,
      showSiteIcons: true,
      showStreak: true,
    }),
    openPdfReaderTarget: async () => undefined,
    saveOnboardingReadingPaceCalibration: async (input) => createReadingPaceSummary({
      language: input.language ?? 'en',
      contentType: input.contentType ?? 'general',
      sampleCount: 1,
      source: 'onboarding',
      hasProfile: true,
      calibrationAccepted: true,
    }),
    resetReadingPaceCalibration: async () => createReadingPaceSummary(),
    refreshReadingToolbarIcon: async () => undefined,
    saveDailyCheckInThresholdWords: async (thresholdWords) => thresholdWords,
    saveReadingToolbarSettings: async (settings) => ({ ...settings }),
    saveShareCardSettings: async (settings) => ({ ...settings }),
    setGlobalReadingRecordingEnabled: async (recordingEnabled) => ({
      recordingEnabled,
      excludedSiteDomains: [],
    }),
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
    getCurrentPdfReaderState: async () => ({ active: false }),
    getCurrentTabSiteAccess: async () => createSupportedSiteAccess({
      url: 'https://docs.example.com/article',
      origin: 'https://docs.example.com/*',
      host: 'docs.example.com',
      collectorState: 'recording',
    }),
    getCurrentPageReadingSummary: async () => ({
      totalWords: 0,
      effectiveWords: 0,
      coveredWords: 0,
      effectiveMinutes: 0,
      hasData: false,
    }),
    getPageReadingSummary: async () => ({
      totalWords: 0,
      effectiveWords: 0,
      coveredWords: 0,
      effectiveMinutes: 0,
      hasData: false,
    }),
    subscribeToRefresh: () => () => undefined,
    openDashboard: async () => undefined,
    openPdfReader: async () => undefined,
    ...overrides,
  };
}

function renderPopup(overrides: Partial<PopupAppDependencies> = {}): Promise<HTMLElement> {
  return renderForSmoke(<PopupApp dependencies={createPopupDependencies(overrides)} />);
}

function renderDashboard(overrides: Partial<DashboardAppDependencies> = {}): Promise<HTMLElement> {
  return renderForSmoke(<DashboardApp dependencies={createDashboardDependencies(overrides)} />);
}

function renderSidePanel(overrides: Partial<SidePanelAppDependencies> = {}): Promise<HTMLElement> {
  return renderForSmoke(<SidePanelApp dependencies={createSidePanelDependencies(overrides)} />);
}

async function renderSidePanelWithAccess(
  access: Awaited<ReturnType<SidePanelAppDependencies['getCurrentTabSiteAccess']>>,
) {
  return renderSidePanel({
    getSidePanelReadingDetails: async () => createSidePanelDetails(createDashboardDetails(320).summary),
    getCurrentTabSiteAccess: async () => access,
  });
}

describe('extension UI entrypoint smoke rendering', () => {
  it('declares Simplified Chinese and the shared brand icon for every extension UI document', () => {
    for (const entrypoint of ['popup', 'sidepanel', 'dashboard', 'pdf-reader']) {
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
    const container = await renderDashboard({
      getReadingDashboardDetails,
    });

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
    const container = await renderDashboard({
      getReadingDashboardDetails,
    });

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
    const container = await renderPopup({
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
      getCurrentTabSiteAccess: async () => createSupportedSiteAccess(),
    });

    const text = container.textContent ?? '';
    expect(text).toContain('阅量 Yuel');
    expect(container.querySelector('.popup-header .yuel-brand')?.getAttribute('role')).toBe('progressbar');
    expect(container.querySelector<HTMLElement>('.popup-header .yuel-brand__mark')?.dataset.state).toBe('complete');
    expect(text).toContain('当前站点');
    expect(text).toContain('今日有效阅读');
    expect(text).toContain('打开侧栏');
    expect(text).toContain('查看仪表盘');
    expect(text).not.toContain('启用当前网站');
    expect(text).not.toContain('已启用网站');
    expect(container.querySelector('.popup-current-site__detail')?.hasAttribute('aria-live')).toBe(false);
    expect(container.querySelector('.popup-metrics')?.hasAttribute('aria-live')).toBe(false);
  });

  it('renders the side panel around current reading, vocabulary, and highlights', async () => {
    const container = await renderSidePanel({
      getSidePanelReadingDetails: async () => ({
        ...createSidePanelDetails(createDashboardDetails(1540).summary),
        recentVocabulary: [{
          lemma: 'unified',
          effectiveSeenCount: 0.2,
          savedCount: 0,
          packTags: [],
          userStatus: 'new',
        }],
      }),
    });

    expect(container.textContent).toContain('当前阅读');
    expect(container.textContent).toContain('本页内容覆盖');
    expect(container.textContent).toContain('今日');
    expect(container.textContent).toContain('值得关注');
    expect(container.textContent).toContain('新词 · 1 次');
    expect(container.textContent).not.toContain('新词 · 0 次');
    expect(container.textContent).toContain('摘录');
    expect(container.textContent).not.toContain('Observe');
    expect(container.querySelector<HTMLElement>('.sidepanel-header .yuel-brand__mark')?.dataset.state).toBe('complete');
  });

  it('uses the live collector signal instead of permission alone for the side-panel status', async () => {
    const recording = await renderSidePanelWithAccess(createSupportedSiteAccess({
      collectorState: 'recording',
    }));
    const idle = await renderSidePanelWithAccess(createSupportedSiteAccess({
      tabId: 2,
      url: 'https://example.com/zh',
      collectorState: 'idle',
    }));
    const unconfirmed = await renderSidePanelWithAccess(createSupportedSiteAccess({
      tabId: 3,
      url: 'https://example.com/loading',
    }));

    expect(recording.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('记录中');
    expect(idle.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('未检测到英文');
    expect(idle.textContent).toContain('当前页面未检测到可记录的英文内容');
    expect(unconfirmed.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('已启用');
    expect(unconfirmed.textContent).toContain('正在确认页面采集状态');
  });

  it('shows active PDF document progress without treating the reader as an unsupported page', async () => {
    const pageId = 'pdf.local_reader-session';
    const getCurrentTabSiteAccess = vi.fn(async () => createSupportedSiteAccess());
    const getPageReadingSummary = vi.fn(async () => ({
      totalWords: 2_400,
      effectiveWords: 640,
      coveredWords: 520,
      effectiveMinutes: 4,
      confidence: 0.78,
      hasData: true,
    }));
    const container = await renderSidePanel({
      getCurrentPdfReaderState: async () => ({
        active: true,
        tabId: 17,
        session: {
          tabId: 17,
          resourceId: `pdf_${'a'.repeat(64)}`,
          pageId,
          displayName: 'Architecture.pdf',
          domain: 'pdf.local',
          updatedAt: 1_234,
        },
      }),
      getCurrentTabSiteAccess,
      getPageReadingSummary,
    });

    expect(getCurrentTabSiteAccess).not.toHaveBeenCalled();
    expect(getPageReadingSummary).toHaveBeenCalledWith(pageId);
    expect(container.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('记录中');
    expect(container.textContent).toContain('当前文档');
    expect(container.textContent).toContain('Architecture.pdf');
    expect(container.textContent).toContain('文档内容覆盖');
    expect(container.textContent).toContain('520 / 2,400 词');
    expect(container.textContent).not.toContain('当前页面无法记录');
    expect(container.textContent).not.toContain('不可记录');
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
    const container = await renderDashboard({
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
        readingSessions: [],
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        hasData: true,
      }),
    });

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
    const container = await renderPopup({
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
      getCurrentTabSiteAccess: async () => createSupportedSiteAccess(),
    });

    expect(container.textContent).toContain('阅量 Yuel');
    expect(container.textContent).toContain('1,280 词');
    expect(container.textContent).toContain('14 分钟');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('已启用');
  });

  it('shows zero popup reading time when only non-time local data exists', async () => {
    const container = await renderPopup({
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
    });

    expect(container.textContent).toContain('0 分钟');
    expect(container.textContent).not.toContain('不足 1 分钟');
  });

  it('shows unavailable popup metrics when local reading stats fail to load', async () => {
    const container = await renderPopup({
      getTodayReadingSummary: async () => {
        throw new Error('stats unavailable');
      },
    });

    expect(container.textContent).toContain('有效阅读不可用');
    expect(container.textContent).toContain('有效时长不可用');
    expect(container.textContent).toContain('页面不可用');
    expect(container.textContent).toContain('学习中词汇不可用');
    expect(container.textContent).toContain('本地数据暂时不可用');
  });

  it('keeps the popup permission detail consistent when current-site access fails', async () => {
    const container = await renderPopup({
      getCurrentTabSiteAccess: async () => {
        throw new Error('site access unavailable');
      },
    });

    expect(container.textContent).toContain('权限状态不可用');
    expect(container.textContent).toContain('暂时无法读取当前页面权限状态');
    expect(container.textContent).not.toContain('正在读取当前标签');
  });

  it('shows Chrome site restrictions without offering a manual enable flow', async () => {
    const container = await renderPopup({
      getCurrentTabSiteAccess: async () => createSupportedSiteAccess({
        granted: false,
        enabled: false,
      }),
    });

    expect(container.textContent).toContain('访问受限');
    expect(container.textContent).toContain('Chrome 已限制此网站的访问权限。');
    expect(container.textContent).not.toContain('启用当前网站');
    expect(container.textContent).not.toContain('暂停记录');
    expect(container.textContent).not.toContain('已启用网站');
  });

  it('pauses recording for only the current site from the popup', async () => {
    const setSiteReadingRecordingEnabled = vi.fn(async () => ({
      recordingEnabled: true,
      excludedSiteDomains: ['example.com'],
    }));
    const container = await renderPopup({
      setSiteReadingRecordingEnabled,
    });
    const siteToggle = container.querySelector<HTMLInputElement>(
      '#popup-site-recording-enabled',
    );

    expect(siteToggle).toBeInstanceOf(HTMLInputElement);
    expect(siteToggle?.checked).toBe(true);
    await act(async () => {
      siteToggle?.click();
    });
    await flushReactMicrotasks(2);

    expect(setSiteReadingRecordingEnabled).toHaveBeenCalledWith(
      'https://example.com/article',
      false,
    );
    expect(siteToggle?.checked).toBe(false);
    expect(container.textContent).toContain('本站暂停');
    expect(container.textContent).toContain('网站记录设置已保存。');
  });

  it('preserves the current-site preference while global recording is paused', async () => {
    const setSiteReadingRecordingEnabled = vi.fn();
    const container = await renderPopup({
      getCurrentTabSiteAccess: async () => createSupportedSiteAccess({
        globalRecordingEnabled: false,
        siteRecordingEnabled: true,
        enabled: false,
        disabledReason: 'global-paused',
      }),
      setSiteReadingRecordingEnabled,
    });
    const siteToggle = container.querySelector<HTMLInputElement>(
      '#popup-site-recording-enabled',
    );

    expect(siteToggle?.checked).toBe(true);
    expect(siteToggle?.disabled).toBe(true);
    expect(container.textContent).toContain('全部暂停');
    expect(container.textContent).toContain('全局记录已暂停，可在仪表盘的阅读档案中恢复。');
    expect(setSiteReadingRecordingEnabled).not.toHaveBeenCalled();
  });

  it('keeps the popup site preference when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = await renderPopup({
      setSiteReadingRecordingEnabled: async () => {
        throw new Error('storage unavailable');
      },
    });
    const siteToggle = container.querySelector<HTMLInputElement>(
      '#popup-site-recording-enabled',
    );

    await act(async () => {
      siteToggle?.click();
    });
    await flushReactMicrotasks(2);

    expect(siteToggle?.checked).toBe(true);
    expect(container.textContent).toContain('网站记录设置保存失败，原设置未改变。');
  });

  it('opens the side panel companion from the popup action', async () => {
    const openSidePanel = vi.fn(async () => undefined);
    const container = await renderPopup({
      openSidePanel,
    });

    await clickButton(findButton(container, '打开侧栏'));

    expect(openSidePanel).toHaveBeenCalledOnce();
  });

  it('opens the PDF reader from the popup action', async () => {
    const openPdfReader = vi.fn(async () => undefined);
    const container = await renderPopup({
      openPdfReader,
    });

    await clickButton(findButton(container, '打开 PDF 阅读器'));

    expect(openPdfReader).toHaveBeenCalledOnce();
  });

  it('shows a popup PDF reader launch failure', async () => {
    const openPdfReader = vi.fn(async () => {
      throw new Error('tab creation failed');
    });
    const container = await renderPopup({
      openPdfReader,
    });

    await clickButton(findButton(container, '打开 PDF 阅读器'));
    await flushReactMicrotasks();

    expect(openPdfReader).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('PDF 阅读器暂时不可用');
  });

  it('shows a popup dashboard launch failure', async () => {
    const openDashboard = vi.fn(async () => {
      throw new Error('tab creation failed');
    });
    const container = await renderPopup({
      openDashboard,
    });

    await clickButton(findButton(container, '查看仪表盘'));
    await flushReactMicrotasks();

    expect(openDashboard).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('仪表盘暂时不可用');
  });

  it('renders dashboard summary, recent pages, and vocabulary exposure from injected local services', async () => {
    const container = await renderDashboard({
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
        readingSessions: [{
          id: 'focus-session-1',
          date: '2026-06-27',
          startedAt: Date.UTC(2026, 5, 27, 9, 30, 0),
          endedAt: Date.UTC(2026, 5, 27, 9, 45, 0),
          effectiveMinutes: 11,
          effectiveWords: 340,
          pageCount: 2,
          sources: [{
            domain: 'developer.mozilla.org',
            effectiveMinutes: 11,
          }],
        }],
        recentPages: [
          {
            pageId: 'page-1',
            domain: 'developer.mozilla.org',
            totalWords: 1200,
            effectiveWords: 620,
            coveredWords: 620,
            effectiveMinutes: 3,
            lastReadAt: Date.UTC(2026, 5, 27, 10, 0, 0),
          },
        ],
        recentVocabulary: [
          {
            lemma: 'resilience',
            effectiveSeenCount: 3,
            savedCount: 2,
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
    });

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
    expect(container.textContent).toContain('每日有效时长');
    expect(container.textContent).toContain('最近会话');
    expect(container.textContent).toContain('2 个页面 · 340 个有效词');
    expect(container.textContent).toContain('有效时长 3 分钟');
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

  it('opens a saved PDF excerpt from the dashboard at its source position', async () => {
    const resourceId = `pdf_${'a'.repeat(64)}`;
    const openPdfReaderTarget = vi.fn(async () => undefined);
    const details = createDashboardDetails(960);
    const container = await renderDashboard({
      getReadingDashboardDetails: async () => ({
        ...details,
        recentSavedItems: [{
          id: 'saved-pdf',
          text: 'Evidence remains connected to its source.',
          type: 'quote',
          sourceDomain: 'pdf.local',
          tags: ['selection', 'pdf'],
          pdfAnchor: {
            annotationId: 'annotation-pdf',
            resourceId,
            pageIndex: 2,
            pageCoordinates: { x: 72, y: 180 },
          },
          createdAt: Date.UTC(2026, 6, 14, 9, 30, 0),
        }],
        hasData: true,
      }),
      openPdfReaderTarget,
    });

    await clickButton(findButton(container, '第 3 页 · 跳回原文'));

    expect(openPdfReaderTarget).toHaveBeenCalledWith({
      resourceId,
      pageIndex: 2,
      annotationId: 'annotation-pdf',
      pageCoordinates: { x: 72, y: 180 },
    });
  });

  it('keeps sharing locked until the daily goal is reached and saves a user-defined goal', async () => {
    const saveDailyCheckInThresholdWords = vi.fn(async (thresholdWords: number) => thresholdWords);
    const refreshReadingToolbarIcon = vi.fn(async () => undefined);
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
    const container = await renderDashboard({
      getReadingDashboardDetails,
      refreshReadingToolbarIcon,
      saveDailyCheckInThresholdWords,
    });

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
    expect(refreshReadingToolbarIcon).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('900 词 / 天');
    expect(container.textContent).toContain('打卡目标已保存，连续记录已重新计算。');
  });

  it('loads and toggles the browser toolbar progress icon preference', async () => {
    const getReadingToolbarSettings = vi.fn(async () => ({
      progressIconEnabled: false,
    }));
    const saveReadingToolbarSettings = vi.fn(async (settings: {
      progressIconEnabled: boolean;
    }) => settings);
    const refreshReadingToolbarIcon = vi.fn(async () => undefined);
    const container = await renderDashboard({
      getReadingToolbarSettings,
      refreshReadingToolbarIcon,
      saveReadingToolbarSettings,
    });

    const progressIconToggle = container.querySelector<HTMLInputElement>(
      '#reading-toolbar-progress-enabled',
    );
    expect(progressIconToggle).toBeInstanceOf(HTMLInputElement);
    expect(progressIconToggle?.checked).toBe(false);
    expect(progressIconToggle?.getAttribute('role')).toBe('switch');
    expect(container.textContent).toContain('已关闭');

    await act(async () => {
      progressIconToggle?.click();
    });
    await flushReactMicrotasks(2);

    expect(saveReadingToolbarSettings).toHaveBeenCalledWith({
      progressIconEnabled: true,
    });
    expect(refreshReadingToolbarIcon).toHaveBeenCalledOnce();
    expect(progressIconToggle?.checked).toBe(true);
    expect(container.textContent).toContain('已开启');
  });

  it('loads and toggles the global reading recording preference', async () => {
    const getReadingRecordingSettings = vi.fn(async () => ({
      recordingEnabled: false,
      excludedSiteDomains: ['docs.example.com'],
    }));
    const setGlobalReadingRecordingEnabled = vi.fn(async (recordingEnabled: boolean) => ({
      recordingEnabled,
      excludedSiteDomains: ['docs.example.com'],
    }));
    const container = await renderDashboard({
      getReadingRecordingSettings,
      setGlobalReadingRecordingEnabled,
    });
    const recordingToggle = container.querySelector<HTMLInputElement>(
      '#reading-recording-enabled',
    );

    expect(recordingToggle).toBeInstanceOf(HTMLInputElement);
    expect(recordingToggle?.checked).toBe(false);
    expect(container.textContent).toContain('自动记录阅读');
    expect(container.textContent).toContain('已暂停');

    await act(async () => {
      recordingToggle?.click();
    });
    await flushReactMicrotasks(2);

    expect(setGlobalReadingRecordingEnabled).toHaveBeenCalledWith(true);
    expect(recordingToggle?.checked).toBe(true);
    expect(container.textContent).toContain('已开启');
  });

  it('restores the previous global recording preference when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = await renderDashboard({
      setGlobalReadingRecordingEnabled: async () => {
        throw new Error('storage unavailable');
      },
    });
    const recordingToggle = container.querySelector<HTMLInputElement>(
      '#reading-recording-enabled',
    );

    await act(async () => {
      recordingToggle?.click();
    });
    await flushReactMicrotasks(2);

    expect(recordingToggle?.checked).toBe(true);
    expect(container.textContent).toContain('自动记录设置保存失败，原设置未改变。');
  });

  it('restores the previous toolbar icon preference when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = await renderDashboard({
      saveReadingToolbarSettings: async () => {
        throw new Error('storage unavailable');
      },
    });
    const progressIconToggle = container.querySelector<HTMLInputElement>(
      '#reading-toolbar-progress-enabled',
    );

    await act(async () => {
      progressIconToggle?.click();
    });
    await flushReactMicrotasks(2);

    expect(progressIconToggle?.checked).toBe(true);
    expect(container.textContent).toContain('浏览器图标设置保存失败，原设置未改变。');
  });

  it('keeps a saved toolbar preference when immediate browser refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const saveReadingToolbarSettings = vi.fn(async (settings: {
      progressIconEnabled: boolean;
    }) => settings);
    const container = await renderDashboard({
      refreshReadingToolbarIcon: async () => {
        throw new Error('background unavailable');
      },
      saveReadingToolbarSettings,
    });
    const progressIconToggle = container.querySelector<HTMLInputElement>(
      '#reading-toolbar-progress-enabled',
    );

    await act(async () => {
      progressIconToggle?.click();
    });
    await flushReactMicrotasks(2);

    expect(saveReadingToolbarSettings).toHaveBeenCalledWith({
      progressIconEnabled: false,
    });
    expect(progressIconToggle?.checked).toBe(false);
    expect(container.textContent).toContain('设置已保存，浏览器图标将在下次后台刷新时生效。');
  });

  it('keeps the side-panel card action locked before the daily goal is reached', async () => {
    const container = await renderSidePanel({
      getSidePanelReadingDetails: async () => createSidePanelDetails(createDashboardDetails(320).summary),
    });

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
      .mockResolvedValueOnce(createReadingPaceSummary())
      .mockImplementationOnce(() => stalePaceRefresh.promise);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const container = await renderDashboard({
      getReadingPaceSummary,
      saveOnboardingReadingPaceCalibration,
    });

    await clickButton(findButton(container, '开始校准'));
    expect(container.textContent).toContain('我已读完');
    expect(container.querySelector('article.calibration-passage')?.getAttribute('lang')).toBe('en');
    expect(document.activeElement).toBe(container.querySelector('#pace-calibration-reading-title'));

    nowSpy.mockReturnValue(61_000);
    await clickButton(findButton(container, '我已读完'));
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

    const saveButton = findButton(container, '保存校准');
    nowSpy.mockReturnValue(181_000);
    await clickButton(saveButton);

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
      saveResult.resolve(createReadingPaceSummary({
        baseWordsPerMinute: 233,
        source: 'onboarding',
        updatedAt: 61_000,
        hasProfile: true,
      }));
      await saveResult.promise;
    });
    await act(async () => {
      stalePaceRefresh.resolve(createReadingPaceSummary({
        baseWordsPerMinute: 180,
      }));
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

  it('restores the default reading pace and removes the reset action', async () => {
    const resetReadingPaceCalibration = vi.fn(async () => createReadingPaceSummary());
    const container = await renderDashboard({
      getReadingPaceSummary: async () => createReadingPaceSummary({
        baseWordsPerMinute: 248,
        sampleCount: 3,
        source: 'adaptive',
        hasProfile: true,
      }),
      resetReadingPaceCalibration,
    });

    expect(container.textContent).toContain('248 WPM');
    await clickButton(findButton(container, '恢复默认速度'));
    await flushReactMicrotasks(2);

    expect(resetReadingPaceCalibration).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('220 WPM');
    expect(findButton(container, '恢复默认速度')).toBeUndefined();
    expect(container.textContent).toContain('已恢复默认阅读速度');
    expect(document.activeElement).toBe(container.querySelector('#pace-calibration-trigger'));
  });

  it('keeps an in-flight dashboard details load valid when pace calibration is saved', async () => {
    const pendingDetails = createDeferred<ReturnType<typeof createDashboardDetails>>();
    const container = await renderDashboard({
      getReadingDashboardDetails: () => pendingDetails.promise,
      getReadingPaceSummary: async () => createReadingPaceSummary(),
      saveOnboardingReadingPaceCalibration: async () => createReadingPaceSummary({
        baseWordsPerMinute: 230,
        source: 'onboarding',
        hasProfile: true,
      }),
    });

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
    const container = await renderDashboard({
      getReadingDashboardDetails,
    });

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
    const container = await renderDashboard({
      getReadingDashboardDetails: () => new Promise(() => undefined),
    });

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
      + '有效时长：11 分钟\n'
      + '页面：2 页\n'
      + '学习中词汇：5 个\n'
      + '今日网站：developer.mozilla.org';
    const container = await renderDashboard({
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
        readingSessions: [],
        recentPages: [],
        recentVocabulary: [],
        recentSavedItems: [],
        hasData: true,
      }),
    });

    await revealTodayCard(container);
    await clickButton(findButton(container, '复制文案'));
    await flushReactMicrotasks();

    expect(copyTextToClipboard).toHaveBeenCalledWith(expectedCopyText);
    expect(container.textContent).toContain('已复制');
  });

  it('lets the user tune the compact website list and keeps copied content in sync', async () => {
    const copyTextToClipboard = vi.fn(async () => undefined);
    const saveShareCardSettings = vi.fn<DashboardAppDependencies['saveShareCardSettings']>(
      async (settings) => settings,
    );
    const container = await renderDashboard({
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
        readingSessions: [],
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
    });

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
      + '有效时长：11 分钟\n'
      + '页面：4 页\n'
      + '学习中词汇：5 个\n'
      + '今日网站：developer.mozilla.org、web.dev',
    );
  });

  it('switches the static card carousel and exports the selected style as a PNG', async () => {
    const exportSummaryCardPng = vi.fn<DashboardAppDependencies['exportSummaryCardPng']>(
      async () => undefined,
    );
    const container = await renderDashboard({
      exportSummaryCardPng,
      getReadingDashboardDetails: async () => createDashboardDetails(960, 'developer.mozilla.org'),
    });

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

    await clickButton(findButton(container, '下载 PNG'));
    await flushReactMicrotasks();

    expect(exportSummaryCardPng).toHaveBeenCalledWith(expect.any(HTMLElement), 'yuel-reading-2026-06-27-berry.png');
    expect((exportSummaryCardPng.mock.calls[0]?.[0] as HTMLElement).dataset.cardTheme).toBe('berry');
    expect(container.textContent).toContain('已下载');
  });

  it('clears local dashboard data through injected services', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const refreshReadingToolbarIcon = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce(createDashboardDetails(960, 'developer.mozilla.org'))
      .mockResolvedValueOnce(createDashboardDetails());
    const container = await renderDashboard({
      getReadingDashboardDetails,
      clearLocalReadingData,
      refreshReadingToolbarIcon,
    });

    await clickButton(findButton(container, '清空本地数据'));
    await flushReactMicrotasks();

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(refreshReadingToolbarIcon).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('从下一篇外语文章开始');
  });

  it('keeps a saved goal successful when browser chrome refresh is unavailable', async () => {
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
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = await renderDashboard({
      getReadingDashboardDetails,
      refreshReadingToolbarIcon: async () => {
        throw new Error('background unavailable');
      },
    });

    await clickButton(findButton(container, '调整目标'));
    const goalInput = container.querySelector<HTMLInputElement>('#daily-check-in-threshold');
    await act(async () => {
      if (!goalInput) return;
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(goalInput, '900');
      goalInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickButton(findButton(container, '保存目标'));

    expect(container.textContent).toContain('900 词 / 天');
    expect(container.textContent).toContain('打卡目标已保存，连续记录已重新计算。');
    expect(console.error).toHaveBeenCalledWith(
      'Failed to refresh Yuel reading toolbar icon',
      expect.any(Error),
    );
  });

  it('resets copied dashboard share state after local data is cleared', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const copyTextToClipboard = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi
      .fn()
      .mockResolvedValueOnce(createDashboardDetails(960, 'developer.mozilla.org'))
      .mockResolvedValueOnce(createDashboardDetails());
    const container = await renderDashboard({
      getReadingDashboardDetails,
      clearLocalReadingData,
      copyTextToClipboard,
    });

    await revealTodayCard(container);
    await clickButton(findButton(container, '复制文案'));
    await flushReactMicrotasks();

    expect(container.textContent).toContain('已复制');

    await clickButton(findButton(container, '清空本地数据'));
    await flushReactMicrotasks();

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
    const container = await renderDashboard({
      getReadingDashboardDetails,
      clearLocalReadingData,
    });

    await clickButton(findButton(container, '清空本地数据'));
    await flushReactMicrotasks();

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
    const container = await renderDashboard({
      getReadingDashboardDetails,
      clearLocalReadingData,
    });

    await clickButton(findButton(container, '清空本地数据'));
    await flushReactMicrotasks();

    expect(clearLocalReadingData).toHaveBeenCalledOnce();
    expect(getReadingDashboardDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('本地数据不可用');
    expect(container.textContent).toContain('本地数据已清空，但仪表盘刷新失败。');
    expect(container.textContent).not.toContain('清空失败，本地数据未改变。');
  });

  it('does not clear local dashboard data when confirmation is declined', async () => {
    const clearLocalReadingData = vi.fn(async () => undefined);
    const getReadingDashboardDetails = vi.fn(async () => createDashboardDetails(960, 'developer.mozilla.org'));
    const container = await renderDashboard({
      getReadingDashboardDetails,
      clearLocalReadingData,
      confirmClearLocalReadingData: () => false,
    });

    await clickButton(findButton(container, '清空本地数据'));
    await flushReactMicrotasks();

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
    const container = await renderSidePanel({
      getSidePanelReadingDetails,
      subscribeToRefresh: (refresh) => {
        requestRefresh = refresh;
        return vi.fn();
      },
    });

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

  it('shows Chrome site restrictions in the side panel without a manual enable action', async () => {
    const container = await renderSidePanel({
      getCurrentTabSiteAccess: async () => createSupportedSiteAccess({
        granted: false,
        enabled: false,
      }),
    });

    expect(container.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('访问受限');
    expect(container.textContent).toContain('Chrome 已限制此网站的访问权限');
    expect(container.textContent).not.toContain('启用当前网站');
    expect(container.textContent).not.toContain('记录中');
  });

  it('distinguishes Yuel recording pauses from Chrome restrictions in the side panel', async () => {
    const globalPause = await renderSidePanelWithAccess(createSupportedSiteAccess({
      globalRecordingEnabled: false,
      enabled: false,
      disabledReason: 'global-paused',
    }));
    const sitePause = await renderSidePanelWithAccess(createSupportedSiteAccess({
      tabId: 2,
      siteRecordingEnabled: false,
      enabled: false,
      disabledReason: 'site-paused',
    }));

    expect(globalPause.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('全部暂停');
    expect(globalPause.textContent).toContain('全部网站的自动记录已暂停');
    expect(globalPause.textContent).not.toContain('Chrome 已限制');
    expect(sitePause.querySelector('.sidepanel-header .yuel-status')?.textContent).toContain('本站暂停');
    expect(sitePause.textContent).toContain('此网站的自动记录已暂停');
    expect(sitePause.textContent).not.toContain('Chrome 已限制');
  });

  it('clears stale side panel host and page metrics while navigation access is pending', async () => {
    let requestRefresh: ((reason?: SidePanelRefreshReason) => void) | undefined;
    const nextAccess = createDeferred<
      Awaited<ReturnType<SidePanelAppDependencies['getCurrentTabSiteAccess']>>
    >();
    const getCurrentTabSiteAccess = vi
      .fn()
      .mockResolvedValueOnce(createSupportedSiteAccess({
        url: 'https://old.example/article',
        origin: 'https://old.example/*',
        host: 'old.example',
      }))
      .mockImplementationOnce(() => nextAccess.promise);
    const getCurrentPageReadingSummary = vi.fn(async (url: string) => (
      url.includes('new.example')
        ? {
            totalWords: 1200,
            effectiveWords: 420,
            coveredWords: 420,
            effectiveMinutes: 5,
            confidence: 0.72,
            hasData: true,
          }
        : {
            totalWords: 1000,
            effectiveWords: 345,
            coveredWords: 345,
            effectiveMinutes: 4,
            confidence: 0.6,
            hasData: true,
          }
    ));
    const container = await renderSidePanel({
      getCurrentTabSiteAccess,
      getCurrentPageReadingSummary,
      subscribeToRefresh: (refresh) => {
        requestRefresh = refresh;
        return vi.fn();
      },
    });

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
      nextAccess.resolve(createSupportedSiteAccess({
        tabId: 2,
        url: 'https://new.example/guide',
        origin: 'https://new.example/*',
        host: 'new.example',
      }));
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
      .mockResolvedValueOnce(createSupportedSiteAccess({
        url: 'https://initial.example/article',
        origin: 'https://initial.example/*',
        host: 'initial.example',
      }))
      .mockImplementationOnce(() => staleAccess.promise)
      .mockResolvedValueOnce(createSupportedSiteAccess({
        tabId: 3,
        url: 'https://fresh.example/guide',
        origin: 'https://fresh.example/*',
        host: 'fresh.example',
      }))
      .mockResolvedValue(createSupportedSiteAccess({
        tabId: 3,
        url: 'https://fresh.example/guide',
        origin: 'https://fresh.example/*',
        host: 'fresh.example',
      }));
    const getCurrentPageReadingSummary = vi.fn((url: string) => {
      if (url.includes('stale.example')) return stalePage.promise;
      return Promise.resolve(
        url.includes('fresh.example')
          ? {
              totalWords: 1000,
              effectiveWords: 420,
              coveredWords: 420,
              effectiveMinutes: 5,
              confidence: 0.75,
              hasData: true,
            }
          : {
              totalWords: 100,
              effectiveWords: 10,
              coveredWords: 10,
              effectiveMinutes: 1,
              confidence: 0.5,
              hasData: true,
            },
      );
    });
    const container = await renderSidePanel({
      getCurrentTabSiteAccess,
      getCurrentPageReadingSummary,
      subscribeToRefresh: (refresh) => {
        requestRefresh = refresh;
        return vi.fn();
      },
    });

    await act(async () => {
      requestRefresh?.('tick');
      staleAccess.resolve(createSupportedSiteAccess({
        tabId: 2,
        url: 'https://stale.example/article',
        origin: 'https://stale.example/*',
        host: 'stale.example',
      }));
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
      .mockResolvedValueOnce(createSupportedSiteAccess({
        url: 'https://first.example/article',
        origin: 'https://first.example/*',
        host: 'first.example',
      }))
      .mockResolvedValueOnce(createSupportedSiteAccess({
        tabId: 2,
        url: 'https://second.example/guide',
        origin: 'https://second.example/*',
        host: 'second.example',
      }));
    const getCurrentPageReadingSummary = vi.fn(async (url: string) => (
      url.includes('second.example')
        ? {
            totalWords: 1200,
            effectiveWords: 420,
            coveredWords: 420,
            effectiveMinutes: 5,
            confidence: 0.72,
            hasData: true,
          }
        : {
            totalWords: 1000,
            effectiveWords: 100,
            coveredWords: 100,
            effectiveMinutes: 1,
            confidence: 0.5,
            hasData: true,
          }
    ));
    const container = await renderSidePanel({
      getSidePanelReadingDetails,
      getCurrentTabSiteAccess,
      getCurrentPageReadingSummary,
      subscribeToRefresh: (refresh) => {
        requestRefresh = refresh;
        return unsubscribe;
      },
    });

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

  it('renders side panel companion metrics from injected local services', async () => {
    const container = await renderSidePanel({
      getSidePanelReadingDetails: async () => createSidePanelDetails({
        effectiveWords: 1540,
        minutes: 18,
        readPages: 4,
        hasData: true,
      }),
    });

    expect(container.textContent).toContain('当前阅读');
    expect(container.textContent).toContain('1,540 词');
    expect(container.textContent).toContain('18 分钟');
    expect(container.textContent).toContain('4 页');
    expect(container.textContent).toContain('docs.example.com');
  });

  it('shows no-data side panel time metric when local reading stats are empty', async () => {
    const container = await renderSidePanel();

    expect(container.textContent).toContain('有效时长0 分钟');
    expect(container.textContent).not.toContain('有效时长不足 1 分钟');
  });

  it('does not show side panel top-domain empty state while local summary is loading', async () => {
    const container = await renderSidePanel({
      getSidePanelReadingDetails: () => new Promise(() => undefined),
    });

    expect(container.textContent).toContain('读取中');
    expect(container.textContent).not.toContain('暂无当前网站');
  });

  it('shows unavailable side panel metrics when local reading stats fail to load', async () => {
    const container = await renderSidePanel({
      getSidePanelReadingDetails: async () => {
        throw new Error('stats unavailable');
      },
    });

    expect(container.textContent).toContain('不可用');
    expect(container.textContent).toContain('有效阅读不可用');
    expect(container.textContent).toContain('有效时长不可用');
    expect(container.textContent).toContain('页面不可用');
    expect(container.textContent).toContain('学习中词汇不可用');
    expect(container.textContent).not.toContain('暂无当前网站');
  });

  it('opens the dashboard from the side panel companion action', async () => {
    const openDashboard = vi.fn(async () => undefined);
    const container = await renderSidePanel({
      openDashboard,
    });

    await clickButton(findButton(container, '打开仪表盘'));

    expect(openDashboard).toHaveBeenCalledOnce();
  });

  it('opens the PDF reader from the side panel companion action', async () => {
    const openPdfReader = vi.fn(async () => undefined);
    const container = await renderSidePanel({
      openPdfReader,
    });

    await clickButton(findButton(container, '打开 PDF 阅读器'));

    expect(openPdfReader).toHaveBeenCalledOnce();
  });

  it('opens a saved PDF excerpt from the side panel at its source position', async () => {
    const resourceId = `pdf_${'b'.repeat(64)}`;
    const openPdfReader = vi.fn(async () => undefined);
    const container = await renderSidePanel({
      getSidePanelReadingDetails: async () => ({
        ...createSidePanelDetails(createDashboardDetails(320).summary),
        recentSavedItems: [{
          id: 'saved-pdf',
          text: 'Return to the evidence.',
          type: 'quote',
          sourceDomain: 'pdf.local',
          tags: ['selection', 'pdf'],
          pdfAnchor: {
            annotationId: 'annotation-pdf',
            resourceId,
            pageIndex: 4,
            pageCoordinates: { x: 64, y: 220 },
          },
          createdAt: Date.UTC(2026, 6, 14, 9, 30, 0),
        }],
      }),
      openPdfReader,
    });

    await clickButton(findButton(container, '第 5 页 · 跳回原文'));

    expect(openPdfReader).toHaveBeenCalledWith({
      resourceId,
      pageIndex: 4,
      annotationId: 'annotation-pdf',
      pageCoordinates: { x: 64, y: 220 },
    });
  });

  it('shows a side panel PDF reader launch failure', async () => {
    const openPdfReader = vi.fn(async () => {
      throw new Error('tab creation failed');
    });
    const container = await renderSidePanel({
      openPdfReader,
    });

    await clickButton(findButton(container, '打开 PDF 阅读器'));
    await flushReactMicrotasks();

    expect(openPdfReader).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('PDF 阅读器暂时不可用');
  });

  it('shows a side panel dashboard launch failure', async () => {
    const openDashboard = vi.fn(async () => {
      throw new Error('tab creation failed');
    });
    const container = await renderSidePanel({
      openDashboard,
    });

    await clickButton(findButton(container, '打开仪表盘'));
    await flushReactMicrotasks();

    expect(openDashboard).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('仪表盘暂时不可用');
  });
});
