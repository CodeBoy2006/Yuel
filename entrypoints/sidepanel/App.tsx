import {
  Activity,
  BookMarked,
  BookOpen,
  ExternalLink,
  Globe2,
  Languages,
  Quote,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import {
  enableCurrentTabSite,
  getCurrentTabSiteAccess,
  type SiteAccessState,
} from '../../src/permissions/siteAccess';
import {
  getCurrentPageReadingSummary,
  getReadingDashboardDetails,
  getTodayReadingSummary,
  type CurrentPageReadingSummary,
  type ReadingDashboardDetails,
  type TodayReadingSummary,
} from '../../src/storage/readingStats';
import {
  ActionButton,
  BrandLockup,
  EmptyState,
  InlineNotice,
  Metric,
  ProgressBar,
  SectionHeader,
  StatusPill,
} from '../../src/ui/primitives';

type StatusTone = 'neutral' | 'positive' | 'warning' | 'danger';
export type SidePanelRefreshReason = 'tab' | 'navigation' | 'resume' | 'tick';

export interface SidePanelAppDependencies {
  getTodayReadingSummary: typeof getTodayReadingSummary;
  openDashboard: (target?: 'share-card') => Promise<void>;
  getCurrentTabSiteAccess?: typeof getCurrentTabSiteAccess;
  enableCurrentTabSite?: typeof enableCurrentTabSite;
  getCurrentPageReadingSummary?: typeof getCurrentPageReadingSummary;
  getReadingDashboardDetails?: typeof getReadingDashboardDetails;
  subscribeToRefresh?: (refresh: (reason?: SidePanelRefreshReason) => void) => () => void;
}

const defaultDependencies: SidePanelAppDependencies = {
  getTodayReadingSummary,
  getCurrentTabSiteAccess,
  enableCurrentTabSite,
  getCurrentPageReadingSummary,
  getReadingDashboardDetails,
  subscribeToRefresh: subscribeToDefaultRefresh,
  openDashboard: async (target) => {
    const url = new URL('/dashboard.html', window.location.href);
    if (target === 'share-card') {
      url.hash = 'share-card';
    }
    await browser.tabs.create({ url: url.toString() });
  },
};

export function SidePanelApp({ dependencies = defaultDependencies }: { dependencies?: SidePanelAppDependencies }) {
  const [summary, setSummary] = useState<TodayReadingSummary>();
  const [details, setDetails] = useState<ReadingDashboardDetails>();
  const [siteAccess, setSiteAccess] = useState<SiteAccessState>();
  const [currentPage, setCurrentPage] = useState<CurrentPageReadingSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const [siteAccessFailed, setSiteAccessFailed] = useState(false);
  const [currentPageFailed, setCurrentPageFailed] = useState(false);
  const [enableBusy, setEnableBusy] = useState(false);
  const [enableDenied, setEnableDenied] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [shareCardBusy, setShareCardBusy] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>();
  const mountedRef = useRef(false);
  const refreshSequenceRef = useRef(0);
  const enableSequenceRef = useRef(0);
  const currentUrlRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async (reason: SidePanelRefreshReason = 'tick') => {
    const requestId = ++refreshSequenceRef.current;
    const isCurrentRequest = () => mountedRef.current && requestId === refreshSequenceRef.current;
    const tasks: Promise<void>[] = [];

    if (reason === 'tab' || reason === 'navigation') {
      currentUrlRef.current = undefined;
      setSiteAccess(undefined);
      setCurrentPage(undefined);
      setCurrentPageFailed(false);
    }

    tasks.push(
      dependencies.getTodayReadingSummary()
        .then((nextSummary) => {
          if (!isCurrentRequest()) return;
          setSummary(nextSummary);
          setLoadFailed(false);
        })
        .catch((error) => {
          console.error('Failed to load Yuel side panel stats', error);
          if (!isCurrentRequest()) return;
          setLoadFailed(true);
        }),
    );

    if (dependencies.getReadingDashboardDetails) {
      tasks.push(
        dependencies.getReadingDashboardDetails()
          .then((nextDetails) => {
            if (!isCurrentRequest()) return;
            setDetails(nextDetails);
            setDetailsFailed(false);
          })
          .catch((error) => {
            console.error('Failed to load Yuel side panel details', error);
            if (!isCurrentRequest()) return;
            setDetailsFailed(true);
          }),
      );
    }

    const loadSiteAccess = dependencies.getCurrentTabSiteAccess;
    const loadCurrentPage = dependencies.getCurrentPageReadingSummary;
    if (loadSiteAccess) {
      tasks.push(
        loadSiteAccess()
          .then(async (nextAccess) => {
            if (!isCurrentRequest()) return;

            const nextUrl = nextAccess.supported ? nextAccess.url : undefined;
            if (!nextUrl || nextUrl !== currentUrlRef.current) {
              setCurrentPage(undefined);
            }
            currentUrlRef.current = nextUrl;
            setSiteAccess(nextAccess);
            setSiteAccessFailed(false);
            setCurrentPageFailed(false);

            if (!nextAccess.supported || !loadCurrentPage) return;

            try {
              const nextPage = await loadCurrentPage(nextAccess.url);
              if (!isCurrentRequest() || currentUrlRef.current !== nextAccess.url) return;
              setCurrentPage(nextPage);
              setCurrentPageFailed(false);
            } catch (error) {
              console.error('Failed to load Yuel side panel current page stats', error);
              if (!isCurrentRequest() || currentUrlRef.current !== nextAccess.url) return;
              setCurrentPage(undefined);
              setCurrentPageFailed(true);
            }
          })
          .catch((error) => {
            console.error('Failed to load Yuel side panel current page state', error);
            if (!isCurrentRequest()) return;
            currentUrlRef.current = undefined;
            setSiteAccess(undefined);
            setCurrentPage(undefined);
            setSiteAccessFailed(true);
            setCurrentPageFailed(false);
          }),
      );
    }

    await Promise.all(tasks);
    if (isCurrentRequest()) {
      setLastUpdatedAt(Date.now());
    }
  }, [dependencies]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh('resume');
    const unsubscribe = dependencies.subscribeToRefresh?.((reason) => {
      void refresh(reason);
    });

    return () => {
      mountedRef.current = false;
      refreshSequenceRef.current += 1;
      enableSequenceRef.current += 1;
      unsubscribe?.();
    };
  }, [dependencies, refresh]);

  const hasSummaryLoader = Boolean(summary) || loadFailed;
  const hasSiteAccessLoader = Boolean(dependencies.getCurrentTabSiteAccess);
  const statusText = formatStatusText(siteAccess, siteAccessFailed, summary, hasSummaryLoader, loadFailed);
  const currentHost = formatCurrentHost({
    siteAccess,
    siteAccessFailed,
    hasSiteAccessLoader,
    summary,
    loadFailed,
    hasSummaryLoader,
  });
  const todayValue = summary ? formatWords(summary.effectiveWords) : loadFailed ? '不可用' : '读取中';
  const timeValue = summary ? (summary.hasData ? formatMinutes(summary.minutes) : '0 分钟') : loadFailed ? '不可用' : '读取中';
  const pagesValue = summary ? `${summary.readPages} 页` : loadFailed ? '不可用' : '读取中';
  const learningValue = summary ? `${summary.learningWords} 个` : loadFailed ? '不可用' : '读取中';
  const vocabulary = details?.recentVocabulary.slice(0, 5) ?? [];
  const savedItem = details?.recentSavedItems[0];
  const shouldEnableCurrentSite = Boolean(siteAccess?.supported && !siteAccess.enabled);
  const showEnableCurrentSite = shouldEnableCurrentSite || enableBusy;
  const refreshLabel = loadFailed || detailsFailed || siteAccessFailed || currentPageFailed
    ? '同步未完成'
    : lastUpdatedAt
      ? '刚刚同步'
      : '同步中';

  const enableSite = async () => {
    const enableCurrentSite = dependencies.enableCurrentTabSite;
    const loadCurrentPage = dependencies.getCurrentPageReadingSummary;
    if (!enableCurrentSite || enableBusy) return;

    setEnableBusy(true);
    setEnableDenied(false);
    setSiteAccessFailed(false);
    const actionId = ++enableSequenceRef.current;
    refreshSequenceRef.current += 1;

    try {
      const result = await enableCurrentSite();
      if (!mountedRef.current || actionId !== enableSequenceRef.current) return;

      // Permission prompts can overlap a scheduled refresh. The explicit user
      // action is newer than any request that began while the prompt was open.
      refreshSequenceRef.current += 1;

      setEnableDenied(result.supported && !result.granted && !result.enabled && !result.starterSite);
      setSiteAccess(result);

      if (!result.supported) {
        currentUrlRef.current = undefined;
        setCurrentPage(undefined);
        return;
      }

      if (currentUrlRef.current !== result.url) {
        setCurrentPage(undefined);
      }
      currentUrlRef.current = result.url;
      if (loadCurrentPage) {
        try {
          const nextPage = await loadCurrentPage(result.url);
          if (!mountedRef.current || actionId !== enableSequenceRef.current || currentUrlRef.current !== result.url) return;
          setCurrentPage(nextPage);
          setCurrentPageFailed(false);
        } catch (error) {
          console.error('Failed to load Yuel side panel current page stats after enabling', error);
          if (!mountedRef.current || actionId !== enableSequenceRef.current) return;
          setCurrentPage(undefined);
          setCurrentPageFailed(true);
        }
      }
    } catch (error) {
      console.error('Failed to enable Yuel from side panel', error);
      if (!mountedRef.current || actionId !== enableSequenceRef.current) return;
      setSiteAccessFailed(true);
    } finally {
      if (mountedRef.current && actionId === enableSequenceRef.current) {
        setEnableBusy(false);
      }
    }
  };

  const openDashboard = async (target?: 'share-card') => {
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
      setDashboardFailed(true);
    } finally {
      setShareCardBusy(false);
      setDashboardBusy(false);
    }
  };

  return (
    <div className={`yuel-app sidepanel-app ${dashboardFailed ? 'sidepanel-app--action-error' : ''}`}>
      <header className="sidepanel-header">
        <BrandLockup compact />
        <StatusPill tone={getStatusTone(siteAccess, siteAccessFailed, loadFailed)}>{statusText}</StatusPill>
      </header>

      <main className="sidepanel-content" aria-label="当前阅读伴读面板">
        <section className="sidepanel-page" aria-labelledby="current-reading-title">
          <div className="sidepanel-context">
            <p className="sidepanel-kicker">当前阅读</p>
            <h1 id="current-reading-title" title={currentHost}>{currentHost}</h1>
            <span title={lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : undefined}>
              {refreshLabel}
            </span>
          </div>

          <div className="sidepanel-page__measure" aria-live="polite" aria-atomic="true">
            <span>本页有效阅读</span>
            <p>
              <strong>{currentPage?.hasData ? formatCount(currentPage.effectiveWords) : '—'}</strong>
              <span> / {currentPage?.totalWords ? formatCount(currentPage.totalWords) : '—'} 词</span>
            </p>
          </div>
          {currentPage && currentPage.totalWords > 0 ? (
            <ProgressBar
              label="本页有效阅读进度"
              max={currentPage.totalWords}
              value={currentPage.effectiveWords}
              valueText={`有效 ${formatCount(currentPage.effectiveWords)} / 总计 ${formatCount(currentPage.totalWords)} 词`}
            />
          ) : null}
          <p className="sidepanel-page__meta">
            {currentPage?.hasData
              ? `${formatMinutes(currentPage.effectiveMinutes)} · ${formatConfidence(currentPage.confidence)}`
              : formatCurrentPageEmptyState(siteAccess, siteAccessFailed, currentPageFailed)}
          </p>

          {showEnableCurrentSite ? (
            <ActionButton
              className="sidepanel-enable"
              type="button"
              icon={Globe2}
              variant="primary"
              disabled={enableBusy}
              aria-busy={enableBusy}
              onClick={() => void enableSite()}
            >
              {enableBusy ? '启用中...' : '启用当前网站'}
            </ActionButton>
          ) : null}
          {enableDenied ? <InlineNotice tone="warning">权限未授予，此网站尚未启用。</InlineNotice> : null}
          {siteAccessFailed ? <InlineNotice tone="danger">当前页面状态暂时不可用。</InlineNotice> : null}
          {currentPageFailed ? <InlineNotice tone="danger">本页数据暂时未更新。</InlineNotice> : null}
        </section>

        <section className="sidepanel-section" aria-labelledby="today-title">
          <SectionHeader icon={Activity} meta={summary?.date ?? undefined}>
            <span id="today-title">今日</span>
          </SectionHeader>
          <div className="sidepanel-metrics">
            <Metric label="有效阅读" value={todayValue} icon={BookOpen} />
            <Metric label="阅读时间" value={timeValue} icon={Activity} />
            <Metric label="页面" value={pagesValue} icon={BookMarked} />
            <Metric label="学习中词汇" value={learningValue} icon={Languages} />
          </div>
          {loadFailed ? <InlineNotice tone="danger">本地阅读数据暂时不可用。</InlineNotice> : null}
        </section>

        <section className="sidepanel-section" aria-labelledby="vocabulary-title">
          <SectionHeader icon={Languages} meta="词汇">
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
                  <span>{formatVocabularyStatus(vocab.userStatus)} · {formatCount(vocab.effectiveSeenCount)} 次</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>
              {detailsFailed ? '词汇数据暂时不可用。' : details ? '还没有值得关注的词汇。' : '正在读取词汇。'}
            </EmptyState>
          )}
        </section>

        <section className="sidepanel-section sidepanel-section--last" aria-labelledby="excerpt-title">
          <SectionHeader icon={Quote} meta="最近保存">
            <span id="excerpt-title">摘录</span>
          </SectionHeader>
          {savedItem ? (
            <figure className="sidepanel-excerpt">
              <blockquote>{savedItem.text}</blockquote>
              <figcaption>
                <span title={savedItem.sourceDomain}>{savedItem.sourceDomain}</span>
                <time dateTime={new Date(savedItem.createdAt).toISOString()}>{formatDateTime(savedItem.createdAt)}</time>
              </figcaption>
            </figure>
          ) : (
            <EmptyState>{detailsFailed ? '摘录数据暂时不可用。' : details ? '还没有保存摘录。' : '正在读取摘录。'}</EmptyState>
          )}
        </section>
      </main>

      <footer className="sidepanel-actions" aria-label="面板操作">
        <div className="sidepanel-actions__grid">
          <ActionButton
            type="button"
            icon={Sparkles}
            variant="primary"
            disabled={shareCardBusy}
            aria-busy={shareCardBusy}
            onClick={() => void openDashboard('share-card')}
          >
            {shareCardBusy ? '打开中...' : '查看今日卡片'}
          </ActionButton>
          <ActionButton
            type="button"
            icon={ExternalLink}
            variant="secondary"
            disabled={dashboardBusy}
            aria-busy={dashboardBusy}
            onClick={() => void openDashboard()}
          >
            {dashboardBusy ? '打开中...' : '打开仪表盘'}
          </ActionButton>
        </div>
        {dashboardFailed ? <InlineNotice tone="danger">仪表盘暂时不可用。</InlineNotice> : null}
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

  window.addEventListener('focus', refreshWhenVisible);
  document.addEventListener('visibilitychange', refreshWhenVisible);
  browser.tabs.onActivated.addListener(handleTabActivated);
  browser.tabs.onUpdated.addListener(handleTabUpdated);
  const intervalId = window.setInterval(refreshOnTick, 5_000);

  return () => {
    window.removeEventListener('focus', refreshWhenVisible);
    document.removeEventListener('visibilitychange', refreshWhenVisible);
    browser.tabs.onActivated.removeListener(handleTabActivated);
    browser.tabs.onUpdated.removeListener(handleTabUpdated);
    window.clearInterval(intervalId);
  };
}

function formatStatusText(
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
  summary: TodayReadingSummary | undefined,
  hasLoaded: boolean,
  loadFailed: boolean,
): string {
  if (siteAccessFailed) return '状态未知';
  if (siteAccess?.supported && siteAccess.enabled) return '记录中';
  if (siteAccess?.supported && !siteAccess.enabled) return '未启用';
  if (siteAccess && !siteAccess.supported) return '不可记录';
  if (loadFailed && !summary) return '不可用';
  if (summary?.hasData) return '今日有记录';
  if (hasLoaded) return '待开始';
  return '读取中';
}

function getStatusTone(
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
  loadFailed: boolean,
): StatusTone {
  if (siteAccessFailed) return 'danger';
  if (siteAccess?.supported && siteAccess.enabled) return 'positive';
  if (siteAccess?.supported && !siteAccess.enabled) return 'warning';
  if (loadFailed) return 'danger';
  return 'neutral';
}

function formatCurrentHost({
  siteAccess,
  siteAccessFailed,
  hasSiteAccessLoader,
  summary,
  loadFailed,
  hasSummaryLoader,
}: {
  siteAccess: SiteAccessState | undefined;
  siteAccessFailed: boolean;
  hasSiteAccessLoader: boolean;
  summary: TodayReadingSummary | undefined;
  loadFailed: boolean;
  hasSummaryLoader: boolean;
}): string {
  if (siteAccess?.supported) return siteAccess.host;
  if (siteAccess && !siteAccess.supported) return '当前页面';
  if (siteAccessFailed) return '当前页面状态不可用';
  if (hasSiteAccessLoader) return '读取中';
  if (summary?.topDomains[0]) return summary.topDomains[0];
  if (loadFailed) return '不可用';
  return hasSummaryLoader ? '暂无当前网站' : '读取中';
}

function formatCurrentPageEmptyState(
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
  currentPageFailed: boolean,
): string {
  if (siteAccessFailed || currentPageFailed) return '本页状态暂时不可用';
  if (!siteAccess) return '正在读取当前页面';
  if (!siteAccess.supported) return '当前页面无法记录';
  if (!siteAccess.enabled) return '启用后显示本页阅读';
  return '等待当前页面产生有效阅读';
}

function formatConfidence(confidence: number | undefined): string {
  if (confidence === undefined) return '置信度待确认';
  if (confidence >= 0.7) return '高置信度';
  if (confidence >= 0.4) return '中置信度';
  return '低置信度';
}

function formatVocabularyStatus(status: ReadingDashboardDetails['recentVocabulary'][number]['userStatus']): string {
  if (status === 'new') return '新词';
  if (status === 'learning') return '学习中';
  if (status === 'known') return '已掌握';
  return '已忽略';
}

function formatWords(words: number): string {
  return `${Math.round(words).toLocaleString()} 词`;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatMinutes(minutes: number): string {
  if (minutes < 1 && minutes > 0) {
    return '不足 1 分钟';
  }

  return `${Math.round(minutes)} 分钟`;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
