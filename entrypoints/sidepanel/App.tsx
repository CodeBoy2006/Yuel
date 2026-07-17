import {
  Activity,
  BookMarked,
  BookOpen,
  ExternalLink,
  Languages,
  Quote,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS } from '../../src/domain/checkIn';
import {
  getCurrentTabSiteAccess,
  isUnsupportedPageAccess,
  type SiteAccessState,
} from '../../src/permissions/siteAccess';
import {
  getCurrentPdfReaderState,
  isPdfReaderSessionStorageKey,
  type CurrentPdfReaderState,
} from '../../src/pdf/sessionContext';
import {
  createPdfReaderUrl,
  type PdfReaderTarget,
} from '../../src/pdf/navigation';
import {
  getCurrentPageReadingSummary,
  getPageReadingSummary,
  getSidePanelReadingDetails,
  type CurrentPageReadingSummary,
  type SidePanelReadingDetails,
  type TodayReadingSummary,
} from '../../src/storage/readingStats';
import {
  formatCount,
  formatDateTime,
  formatMinutes,
  formatVocabularyExposureCount,
  formatVocabularyStatus,
  formatWords,
} from '../../src/ui/formatters';
import {
  ActionButton,
  BrandLockup,
  EmptyState,
  InlineNotice,
  Metric,
  ProgressBar,
  SectionHeader,
  StatusPill,
  type StatusTone,
} from '../../src/ui/primitives';

export type SidePanelRefreshReason = 'tab' | 'navigation' | 'resume' | 'tick';

export interface SidePanelAppDependencies {
  openDashboard: (target?: 'share-card') => Promise<void>;
  openPdfReader: (target: PdfReaderTarget) => Promise<void>;
  getCurrentPdfReaderState: typeof getCurrentPdfReaderState;
  getCurrentTabSiteAccess: typeof getCurrentTabSiteAccess;
  getCurrentPageReadingSummary: typeof getCurrentPageReadingSummary;
  getPageReadingSummary: typeof getPageReadingSummary;
  getSidePanelReadingDetails: typeof getSidePanelReadingDetails;
  subscribeToRefresh: (refresh: (reason?: SidePanelRefreshReason) => void) => () => void;
}

const defaultDependencies: SidePanelAppDependencies = {
  getCurrentPdfReaderState,
  getCurrentTabSiteAccess,
  getCurrentPageReadingSummary,
  getPageReadingSummary,
  getSidePanelReadingDetails,
  subscribeToRefresh: subscribeToDefaultRefresh,
  openDashboard: async (target) => {
    const url = new URL('/dashboard.html', window.location.href);
    if (target === 'share-card') {
      url.hash = 'share-card';
    }
    await browser.tabs.create({ url: url.toString() });
  },
  openPdfReader: async (target) => {
    await browser.tabs.create({
      url: createPdfReaderUrl(window.location.href, target),
    });
  },
};

export function SidePanelApp({ dependencies = defaultDependencies }: { dependencies?: SidePanelAppDependencies }) {
  const [details, setDetails] = useState<SidePanelReadingDetails>();
  const [pdfReaderState, setPdfReaderState] = useState<CurrentPdfReaderState>();
  const [siteAccess, setSiteAccess] = useState<SiteAccessState>();
  const [currentPage, setCurrentPage] = useState<CurrentPageReadingSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [siteAccessFailed, setSiteAccessFailed] = useState(false);
  const [currentPageFailed, setCurrentPageFailed] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [shareCardBusy, setShareCardBusy] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [pdfReaderBusy, setPdfReaderBusy] = useState(false);
  const [pdfReaderFailed, setPdfReaderFailed] = useState(false);
  const mountedRef = useRef(false);
  const refreshSequenceRef = useRef(0);
  const dashboardActionSequenceRef = useRef(0);
  const dashboardActionBusyRef = useRef(false);
  const pdfReaderBusyRef = useRef(false);
  const currentTargetKeyRef = useRef<string | undefined>(undefined);
  const refreshInFlightRef = useRef(false);
  const activeRefreshTokenRef = useRef(0);
  const pendingRefreshReasonRef = useRef<SidePanelRefreshReason | undefined>(undefined);
  const runRefreshRef = useRef<(reason: SidePanelRefreshReason) => Promise<void>>(async () => undefined);

  const runRefresh = useCallback(async (_reason: SidePanelRefreshReason) => {
    const requestId = ++refreshSequenceRef.current;
    const isCurrentRequest = () => mountedRef.current && requestId === refreshSequenceRef.current;
    const detailsTask = dependencies.getSidePanelReadingDetails()
      .then((nextDetails) => {
        if (!isCurrentRequest()) return;
        setDetails(nextDetails);
        setLoadFailed(false);
      })
      .catch((error) => {
        console.error('Failed to load Yuel side panel details', error);
        if (!isCurrentRequest()) return;
        setLoadFailed(true);
      });
    const currentTargetTask = (async () => {
      let nextPdfReaderState: CurrentPdfReaderState = { active: false };
      try {
        nextPdfReaderState = await dependencies.getCurrentPdfReaderState();
      } catch (error) {
        console.error('Failed to identify the active Yuel PDF reader', error);
      }
      if (!isCurrentRequest()) return;

      setPdfReaderState(nextPdfReaderState);
      setSiteAccessFailed(false);
      setCurrentPageFailed(false);

      if (nextPdfReaderState.active) {
        const session = nextPdfReaderState.session;
        const nextTargetKey = session
          ? `pdf:${session.pageId}`
          : `pdf-reader:${nextPdfReaderState.tabId ?? 'unknown'}`;
        if (nextTargetKey !== currentTargetKeyRef.current) {
          setCurrentPage(undefined);
        }
        currentTargetKeyRef.current = nextTargetKey;
        setSiteAccess(undefined);

        if (!session) return;

        try {
          const nextPage = await dependencies.getPageReadingSummary(session.pageId);
          if (
            !isCurrentRequest()
            || currentTargetKeyRef.current !== nextTargetKey
          ) {
            return;
          }
          setCurrentPage(nextPage);
          setCurrentPageFailed(false);
        } catch (error) {
          console.error('Failed to load Yuel PDF reader progress', error);
          if (
            !isCurrentRequest()
            || currentTargetKeyRef.current !== nextTargetKey
          ) {
            return;
          }
          setCurrentPage(undefined);
          setCurrentPageFailed(true);
        }
        return;
      }

      try {
        const nextAccess = await dependencies.getCurrentTabSiteAccess();
        if (!isCurrentRequest()) return;

        const nextTargetKey = nextAccess.supported
          ? `web:${nextAccess.url}`
          : undefined;
        if (!nextTargetKey || nextTargetKey !== currentTargetKeyRef.current) {
          setCurrentPage(undefined);
        }
        currentTargetKeyRef.current = nextTargetKey;
        setSiteAccess(nextAccess);

        if (!nextAccess.supported) return;

        try {
          const nextPage = await dependencies.getCurrentPageReadingSummary(nextAccess.url);
          if (
            !isCurrentRequest()
            || currentTargetKeyRef.current !== nextTargetKey
          ) {
            return;
          }
          setCurrentPage(nextPage);
          setCurrentPageFailed(false);
        } catch (error) {
          console.error('Failed to load Yuel side panel current page stats', error);
          if (
            !isCurrentRequest()
            || currentTargetKeyRef.current !== nextTargetKey
          ) {
            return;
          }
          setCurrentPage(undefined);
          setCurrentPageFailed(true);
        }
      } catch (error) {
        console.error('Failed to load Yuel side panel current page state', error);
        if (!isCurrentRequest()) return;
        currentTargetKeyRef.current = undefined;
        setSiteAccess(undefined);
        setCurrentPage(undefined);
        setSiteAccessFailed(true);
        setCurrentPageFailed(false);
      }
    })();

    await Promise.all([detailsTask, currentTargetTask]);
  }, [dependencies]);

  runRefreshRef.current = runRefresh;

  const refresh = useCallback((reason: SidePanelRefreshReason = 'tick') => {
    if (!mountedRef.current) return;

    const isUrgentRefresh = reason === 'tab' || reason === 'navigation';
    if (isUrgentRefresh) {
      refreshSequenceRef.current += 1;
      currentTargetKeyRef.current = undefined;
      setPdfReaderState(undefined);
      setSiteAccess(undefined);
      setCurrentPage(undefined);
      setCurrentPageFailed(false);
    }

    const startRefresh = (nextReason: SidePanelRefreshReason) => {
      const refreshToken = ++activeRefreshTokenRef.current;
      refreshInFlightRef.current = true;
      void runRefreshRef.current(nextReason).finally(() => {
        if (refreshToken !== activeRefreshTokenRef.current) return;
        refreshInFlightRef.current = false;
        if (mountedRef.current && pendingRefreshReasonRef.current) {
          const pendingReason = pendingRefreshReasonRef.current;
          pendingRefreshReasonRef.current = undefined;
          startRefresh(pendingReason);
        }
      });
    };

    if (isUrgentRefresh) {
      pendingRefreshReasonRef.current = undefined;
      startRefresh(reason);
      return;
    }

    pendingRefreshReasonRef.current = mergeSidePanelRefreshReason(pendingRefreshReasonRef.current, reason);
    if (refreshInFlightRef.current) return;

    const pendingReason = pendingRefreshReasonRef.current;
    pendingRefreshReasonRef.current = undefined;
    startRefresh(pendingReason);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh('resume');
    const unsubscribe = dependencies.subscribeToRefresh((reason) => {
      void refresh(reason);
    });

    return () => {
      mountedRef.current = false;
      refreshSequenceRef.current += 1;
      dashboardActionSequenceRef.current += 1;
      dashboardActionBusyRef.current = false;
      pdfReaderBusyRef.current = false;
      activeRefreshTokenRef.current += 1;
      refreshInFlightRef.current = false;
      pendingRefreshReasonRef.current = undefined;
      unsubscribe();
    };
  }, [dependencies, refresh]);

  const summary = details?.summary;
  const statusText = formatStatusText(
    pdfReaderState,
    siteAccess,
    siteAccessFailed,
    summary,
    loadFailed,
  );
  const currentHost = formatCurrentHost(
    pdfReaderState,
    siteAccess,
    siteAccessFailed,
  );
  const isPdfReaderActive = pdfReaderState?.active === true;
  const coverageLabel = isPdfReaderActive ? '文档内容覆盖' : '本页内容覆盖';
  const todayValue = summary ? formatWords(summary.effectiveWords) : loadFailed ? '不可用' : '读取中';
  const timeValue = summary ? (summary.hasData ? formatMinutes(summary.minutes) : '0 分钟') : loadFailed ? '不可用' : '读取中';
  const pagesValue = summary ? `${summary.readPages} 页` : loadFailed ? '不可用' : '读取中';
  const learningValue = summary ? `${summary.learningWords} 个` : loadFailed ? '不可用' : '读取中';
  const checkInThresholdWords = summary?.checkInThresholdWords ?? DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS;
  const checkInCompleted = summary ? summary.checkInCompleted : false;
  const checkInRemainingWords = summary
    ? Math.max(0, Math.ceil(checkInThresholdWords - summary.effectiveWords))
    : checkInThresholdWords;
  const dashboardActionBusy = dashboardBusy || shareCardBusy;
  const vocabulary = details?.recentVocabulary ?? [];
  const savedItem = details?.recentSavedItems[0];
  const savedPdfAnchor = savedItem?.pdfAnchor;
  const savedItemSource = savedItem?.sourceTitle || savedItem?.sourceDomain;
  const currentPageDetail = currentPage?.hasData
    ? `有效 ${formatWords(currentPage.effectiveWords)} · ${formatMinutes(currentPage.effectiveMinutes)} · ${formatConfidence(currentPage.confidence)}`
    : formatCurrentPageEmptyState(
      pdfReaderState,
      siteAccess,
      siteAccessFailed,
      currentPageFailed,
    );

  const openDashboard = async (target?: 'share-card') => {
    if (dashboardActionBusyRef.current) return;
    const actionId = ++dashboardActionSequenceRef.current;
    dashboardActionBusyRef.current = true;
    if (target === 'share-card') {
      setShareCardBusy(true);
    } else {
      setDashboardBusy(true);
    }
    setDashboardFailed(false);

    try {
      await dependencies.openDashboard(target);
    } catch (error) {
      console.error('Failed to open Yuel dashboard from side panel', error);
      if (!mountedRef.current || actionId !== dashboardActionSequenceRef.current) return;
      setDashboardFailed(true);
    } finally {
      if (actionId === dashboardActionSequenceRef.current) {
        dashboardActionBusyRef.current = false;
      }
      if (mountedRef.current && actionId === dashboardActionSequenceRef.current) {
        setShareCardBusy(false);
        setDashboardBusy(false);
      }
    }
  };

  const openPdfReader = async (target: PdfReaderTarget) => {
    if (pdfReaderBusyRef.current) return;
    pdfReaderBusyRef.current = true;
    setPdfReaderBusy(true);
    setPdfReaderFailed(false);

    try {
      await dependencies.openPdfReader(target);
    } catch (error) {
      console.error('Failed to open Yuel PDF reader from side panel', error);
      if (mountedRef.current) setPdfReaderFailed(true);
    } finally {
      pdfReaderBusyRef.current = false;
      if (mountedRef.current) setPdfReaderBusy(false);
    }
  };

  return (
    <div
      className={`yuel-app sidepanel-app ${
        dashboardFailed || pdfReaderFailed ? 'sidepanel-app--action-error' : ''
      }`}
    >
      <header className="sidepanel-header">
        <BrandLockup
          compact
          progress={summary ? {
            effectiveWords: summary.effectiveWords,
            thresholdWords: checkInThresholdWords,
            completed: checkInCompleted,
          } : undefined}
          progressStatus={loadFailed ? 'unavailable' : 'loading'}
        />
        <StatusPill tone={getStatusTone(pdfReaderState, siteAccess, siteAccessFailed, loadFailed)}>{statusText}</StatusPill>
      </header>

      <main className="sidepanel-content" aria-label="当前阅读伴读面板">
        <section className="sidepanel-page" aria-labelledby="current-reading-title">
          <div className="sidepanel-context">
            <p className="sidepanel-kicker">
              {isPdfReaderActive ? '当前文档' : '当前阅读'}
            </p>
            <h1 id="current-reading-title" title={currentHost}>{currentHost}</h1>
          </div>

          <div className="sidepanel-page__measure">
            <span>{coverageLabel}</span>
            <p>
              <strong>{currentPage?.hasData ? formatCount(currentPage.coveredWords) : '—'}</strong>
              <span> / {currentPage?.totalWords ? formatCount(currentPage.totalWords) : '—'} 词</span>
            </p>
          </div>
          {currentPage && currentPage.totalWords > 0 ? (
            <ProgressBar
              label={coverageLabel}
              max={currentPage.totalWords}
              value={currentPage.coveredWords}
              valueText={`覆盖 ${formatCount(currentPage.coveredWords)} / 总计 ${formatCount(currentPage.totalWords)} 词`}
            />
          ) : null}
          {currentPageDetail ? <p className="sidepanel-page__meta">{currentPageDetail}</p> : null}

          {siteAccessFailed || currentPageFailed ? (
            <InlineNotice tone="danger">当前页面数据暂时不可用。</InlineNotice>
          ) : null}
        </section>

        <section className="sidepanel-section" aria-labelledby="today-title">
          <SectionHeader icon={Activity} meta={summary?.date ?? undefined}>
            <span id="today-title">今日</span>
          </SectionHeader>
          <div className="sidepanel-metrics">
            <Metric label="有效阅读" value={todayValue} icon={BookOpen} />
            <Metric label="有效时长" value={timeValue} icon={Activity} />
            <Metric label="页面" value={pagesValue} icon={BookMarked} />
            <Metric label="学习中词汇" value={learningValue} icon={Languages} />
          </div>
          {loadFailed ? <InlineNotice tone="danger">本地阅读数据暂时不可用。</InlineNotice> : null}
        </section>

        <section className="sidepanel-section" aria-labelledby="vocabulary-title">
          <SectionHeader icon={Languages}>
            <span id="vocabulary-title">值得关注</span>
          </SectionHeader>
          {vocabulary.length > 0 ? (
            <ul className="sidepanel-vocabulary">
              {vocabulary.map((vocab) => (
                <li key={vocab.lemma}>
                  <span className="sidepanel-vocabulary__term">
                    <i data-status={vocab.userStatus} aria-hidden="true" />
                    {vocab.lemma}
                  </span>
                  <span>{formatVocabularyStatus(vocab.userStatus)} · {formatVocabularyExposureCount(vocab.effectiveSeenCount)} 次</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              {loadFailed ? '词汇暂时不可用。' : details ? '暂无关注词汇。' : '正在读取...'}
            </EmptyState>
          )}
        </section>

        <section className="sidepanel-section sidepanel-section--last" aria-labelledby="excerpt-title">
          <SectionHeader icon={Quote}>
            <span id="excerpt-title">最近摘录</span>
          </SectionHeader>
          {savedItem ? (
            <figure className="sidepanel-excerpt">
              <blockquote>{savedItem.text}</blockquote>
              <figcaption>
                <span title={savedItemSource}>{savedItemSource}</span>
                <time dateTime={new Date(savedItem.createdAt).toISOString()}>{formatDateTime(savedItem.createdAt)}</time>
              </figcaption>
              {savedPdfAnchor ? (
                <button
                  className="sidepanel-excerpt__backlink"
                  type="button"
                  disabled={pdfReaderBusy}
                  aria-label={`第 ${savedPdfAnchor.pageIndex + 1} 页 · 跳回原文`}
                  aria-busy={pdfReaderBusy}
                  onClick={() => void openPdfReader({
                    resourceId: savedPdfAnchor.resourceId,
                    pageIndex: savedPdfAnchor.pageIndex,
                    annotationId: savedPdfAnchor.annotationId,
                    ...(savedPdfAnchor.pageCoordinates
                      ? { pageCoordinates: savedPdfAnchor.pageCoordinates }
                      : {}),
                  })}
                >
                  <ExternalLink aria-hidden="true" />
                  {pdfReaderBusy
                    ? '打开中...'
                    : `回到第 ${savedPdfAnchor.pageIndex + 1} 页`}
                </button>
              ) : null}
            </figure>
          ) : (
            <EmptyState>{loadFailed ? '摘录暂时不可用。' : details ? '暂无摘录。' : '正在读取...'}</EmptyState>
          )}
        </section>
      </main>

      <footer className="sidepanel-actions" aria-label="面板操作">
        <div className="sidepanel-actions__grid">
          <ActionButton
            type="button"
            icon={Sparkles}
            variant="primary"
            disabled={dashboardActionBusy || !checkInCompleted}
            title={checkInCompleted ? undefined : `还差 ${formatCount(checkInRemainingWords)} 词完成今日打卡`}
            aria-label={checkInCompleted
              ? '查看今日卡片'
              : summary
                ? `今日卡片，还差 ${formatCount(checkInRemainingWords)} 词解锁`
                : loadFailed
                  ? '今日卡片暂时不可用'
                  : '正在读取今日卡片状态'}
            aria-busy={shareCardBusy}
            onClick={() => void openDashboard('share-card')}
          >
            {shareCardBusy ? '打开中...' : '今日卡片'}
          </ActionButton>
          <ActionButton
            type="button"
            icon={ExternalLink}
            variant="secondary"
            disabled={dashboardActionBusy}
            aria-label="打开仪表盘"
            aria-busy={dashboardBusy}
            onClick={() => void openDashboard()}
          >
            {dashboardBusy ? '打开中...' : '仪表盘'}
          </ActionButton>
        </div>
        {dashboardFailed ? <InlineNotice tone="danger">仪表盘暂时不可用。</InlineNotice> : null}
        {pdfReaderFailed ? <InlineNotice tone="danger">PDF 阅读器暂时不可用。</InlineNotice> : null}
      </footer>
    </div>
  );
}

function subscribeToDefaultRefresh(refresh: (reason?: SidePanelRefreshReason) => void): () => void {
  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      refresh('resume');
    }
  };
  const handleTabActivated = () => refresh('tab');
  const handleTabUpdated = (
    _tabId: number,
    changeInfo: { status?: string; url?: string },
    tab: { active?: boolean },
  ) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
      refresh('navigation');
    }
  };
  const refreshOnTick = () => {
    if (document.visibilityState === 'visible') {
      refresh('tick');
    }
  };
  const handleStorageChange = (
    changes: Record<string, unknown>,
    areaName: string,
  ) => {
    if (
      areaName === 'session'
      && Object.keys(changes).some(isPdfReaderSessionStorageKey)
    ) {
      refresh('navigation');
    }
  };

  window.addEventListener('focus', refreshWhenVisible);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  browser.tabs.onActivated.addListener(handleTabActivated);
  browser.tabs.onUpdated.addListener(handleTabUpdated);
  browser.storage.onChanged.addListener(handleStorageChange);
  const intervalId = window.setInterval(refreshOnTick, 5_000);

  return () => {
    window.removeEventListener('focus', refreshWhenVisible);
    document.removeEventListener('visibilitychange', refreshWhenVisible);
    browser.tabs.onActivated.removeListener(handleTabActivated);
    browser.tabs.onUpdated.removeListener(handleTabUpdated);
    browser.storage.onChanged.removeListener(handleStorageChange);
    window.clearInterval(intervalId);
  };
}

function formatStatusText(
  pdfReaderState: CurrentPdfReaderState | undefined,
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
  summary: TodayReadingSummary | undefined,
  loadFailed: boolean,
): string {
  if (siteAccessFailed) return '状态未知';
  if (pdfReaderState?.active) {
    return pdfReaderState.session ? '记录中' : 'PDF 待打开';
  }
  if (siteAccess?.supported && siteAccess.disabledReason === 'global-paused') return '全部暂停';
  if (siteAccess?.supported && siteAccess.disabledReason === 'site-paused') return '本站暂停';
  if (siteAccess?.supported && !siteAccess.enabled) return '访问受限';
  if (siteAccess?.supported && siteAccess.collectorState === 'recording') return '记录中';
  if (siteAccess?.supported && siteAccess.collectorState === 'idle') return '未检测到英文';
  if (siteAccess?.supported) return '已启用';
  if (isUnsupportedPageAccess(siteAccess)) return '不可记录';
  if (siteAccess) return '状态未知';
  if (loadFailed && !summary) return '不可用';
  if (summary?.hasData) return '今日有记录';
  if (summary) return '待开始';
  return '读取中';
}

function getStatusTone(
  pdfReaderState: CurrentPdfReaderState | undefined,
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
  loadFailed: boolean,
): StatusTone {
  if (siteAccessFailed) return 'danger';
  if (pdfReaderState?.active && pdfReaderState.session) return 'positive';
  if (siteAccess?.supported && siteAccess.enabled && siteAccess.collectorState === 'recording') return 'positive';
  if (siteAccess?.supported && siteAccess.disabledReason === 'browser-restricted') return 'warning';
  if (loadFailed) return 'danger';
  return 'neutral';
}

function formatCurrentHost(
  pdfReaderState: CurrentPdfReaderState | undefined,
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
): string {
  if (pdfReaderState?.active) {
    return pdfReaderState.session?.displayName ?? 'PDF 阅读器';
  }
  if (siteAccess?.supported) return siteAccess.host;
  if (siteAccess && !siteAccess.supported) return '当前页面';
  if (siteAccessFailed) return '当前页面状态不可用';
  return '读取中';
}

function formatCurrentPageEmptyState(
  pdfReaderState: CurrentPdfReaderState | undefined,
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
  currentPageFailed: boolean,
): string | undefined {
  if (siteAccessFailed || currentPageFailed) return undefined;
  if (pdfReaderState?.active) {
    return pdfReaderState.session
      ? '等待有效阅读'
      : '尚未打开 PDF';
  }
  if (!siteAccess || !siteAccess.supported) return undefined;
  if (siteAccess.disabledReason === 'global-paused') return '在“阅读档案”中恢复。';
  if (siteAccess.disabledReason === 'site-paused') return '可在扩展弹窗中恢复。';
  if (!siteAccess.enabled) return '请在 Chrome 中允许网站访问。';
  if (siteAccess.collectorState === 'idle') return undefined;
  if (!siteAccess.collectorState) return undefined;
  return '等待有效阅读';
}

function formatConfidence(confidence: number | undefined): string {
  if (confidence === undefined) return '待确认';
  if (confidence >= 0.7) return '高置信';
  if (confidence >= 0.4) return '中置信';
  return '低置信';
}

function mergeSidePanelRefreshReason(
  current: SidePanelRefreshReason | undefined,
  next: SidePanelRefreshReason,
): SidePanelRefreshReason {
  if (!current) return next;

  const priority: Record<SidePanelRefreshReason, number> = {
    tick: 0,
    resume: 1,
    navigation: 2,
    tab: 3,
  };
  return priority[next] >= priority[current] ? next : current;
}
