import {
  Activity,
  BookMarked,
  BookOpen,
  ExternalLink,
  Gauge,
  Globe2,
  Languages,
  Quote,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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

export interface SidePanelAppDependencies {
  getTodayReadingSummary: typeof getTodayReadingSummary;
  openDashboard: (target?: 'share-card') => Promise<void>;
  getCurrentTabSiteAccess?: typeof getCurrentTabSiteAccess;
  enableCurrentTabSite?: typeof enableCurrentTabSite;
  getCurrentPageReadingSummary?: typeof getCurrentPageReadingSummary;
  getReadingDashboardDetails?: typeof getReadingDashboardDetails;
}

const defaultDependencies: SidePanelAppDependencies = {
  getTodayReadingSummary,
  getCurrentTabSiteAccess,
  enableCurrentTabSite,
  getCurrentPageReadingSummary,
  getReadingDashboardDetails,
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
  const [enableBusy, setEnableBusy] = useState(false);
  const [enableDenied, setEnableDenied] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [shareCardBusy, setShareCardBusy] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    void dependencies.getTodayReadingSummary()
      .then((nextSummary) => {
        if (!mounted) return;
        setSummary(nextSummary);
      })
      .catch((error) => {
        console.error('Failed to load Yuel side panel stats', error);
        if (!mounted) return;
        setLoadFailed(true);
      });

    if (dependencies.getReadingDashboardDetails) {
      void dependencies.getReadingDashboardDetails()
        .then((nextDetails) => {
          if (!mounted) return;
          setDetails(nextDetails);
        })
        .catch((error) => {
          console.error('Failed to load Yuel side panel details', error);
          if (!mounted) return;
          setDetailsFailed(true);
        });
    }

    return () => {
      mounted = false;
    };
  }, [dependencies]);

  useEffect(() => {
    let mounted = true;
    const loadSiteAccess = dependencies.getCurrentTabSiteAccess;
    const loadCurrentPage = dependencies.getCurrentPageReadingSummary;

    if (!loadSiteAccess) {
      return () => {
        mounted = false;
      };
    }

    void loadSiteAccess()
      .then(async (nextAccess) => {
        if (!mounted) return;
        setSiteAccess(nextAccess);
        if (!nextAccess.supported || !loadCurrentPage) return;
        const nextPage = await loadCurrentPage(nextAccess.url);
        if (!mounted) return;
        setCurrentPage(nextPage);
      })
      .catch((error) => {
        console.error('Failed to load Yuel side panel current page state', error);
        if (!mounted) return;
        setSiteAccessFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [dependencies]);

  const hasLoaded = Boolean(summary) || loadFailed;
  const statusText = formatStatusText(siteAccess, siteAccessFailed, summary, hasLoaded, loadFailed);
  const currentHost = siteAccess?.supported ? siteAccess.host : summary?.topDomains[0] ?? (loadFailed ? '不可用' : hasLoaded ? '暂无当前网站' : '读取中');
  const todayValue = loadFailed ? '不可用' : summary ? formatWords(summary.effectiveWords) : '读取中';
  const timeValue = loadFailed ? '不可用' : summary?.hasData ? formatMinutes(summary.minutes) : hasLoaded ? '0 min' : '读取中';
  const pagesValue = loadFailed ? '不可用' : summary ? `${summary.readPages} pages` : '读取中';
  const learningValue = loadFailed ? '不可用' : summary ? `${summary.learningWords} words` : '读取中';
  const vocabulary = details?.recentVocabulary.slice(0, 5) ?? [];
  const savedItem = details?.recentSavedItems[0];
  const pageProgress = currentPage?.totalWords ? Math.min(100, Math.round((currentPage.effectiveWords / currentPage.totalWords) * 100)) : 0;
  const canEnableCurrentSite = Boolean(siteAccess?.supported && !siteAccess.enabled && !enableBusy);

  const enableSite = async () => {
    const enableCurrentSite = dependencies.enableCurrentTabSite;
    const loadCurrentPage = dependencies.getCurrentPageReadingSummary;
    if (!enableCurrentSite) {
      return;
    }
    setEnableBusy(true);
    setEnableDenied(false);
    setSiteAccessFailed(false);

    try {
      const result = await enableCurrentSite();
      setEnableDenied(result.supported && !result.granted && !result.enabled && !result.starterSite);
      setSiteAccess(
        result.supported
          ? {
              supported: true,
              tabId: result.tabId,
              url: result.url,
              origin: result.origin,
              host: result.host,
              granted: result.granted,
              enabled: result.enabled,
              starterSite: result.starterSite,
            }
          : result,
      );
      if (result.supported && loadCurrentPage) {
        setCurrentPage(await loadCurrentPage(result.url));
      }
    } catch (error) {
      console.error('Failed to enable Yuel from side panel', error);
      setSiteAccessFailed(true);
    } finally {
      setEnableBusy(false);
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
    <main className="min-h-screen bg-[#F7F5EF] pb-28 text-[#111827]">
      <header className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-[#F7F5EF]/95 px-4 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-[#2F9B74]" aria-hidden="true" />
              <h1 className="text-lg font-bold">当前阅读</h1>
            </div>
            <p className="mt-1 truncate text-sm text-[#6B7280]">{currentHost}</p>
          </div>
          <span className="rounded-full border border-[#DDE7DF] bg-white px-2.5 py-1 text-[11px] font-bold text-[#1F7A5B]">
            {statusText}
          </span>
        </div>
      </header>

      <section className="grid gap-3 px-4 py-4">
        <section className="rounded-[24px] bg-[#101827] p-4 text-white shadow-[0_18px_40px_rgba(16,24,39,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#D8B46A]">本页有效阅读</p>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
                {currentPage?.hasData ? `${formatCount(currentPage.effectiveWords)} / ${formatCount(currentPage.totalWords)} words` : '等待输入'}
              </p>
            </div>
            <Gauge className="h-5 w-5 text-[#BCE9D8]" aria-hidden="true" />
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/12">
            <div className="h-full rounded-full bg-[#2F9B74]" style={{ width: `${pageProgress}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span>{currentPage?.hasData ? `${formatMinutes(currentPage.effectiveMinutes)} · ${formatConfidence(currentPage.confidence)}` : formatCurrentPageEmptyState(siteAccess)}</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5">Tech English</span>
          </div>
          {canEnableCurrentSite ? (
            <button
              type="button"
              disabled={enableBusy}
              onClick={() => void enableSite()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-white px-3 py-2.5 text-sm font-bold text-[#101827] hover:bg-[#F1F5F0] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Globe2 className="h-4 w-4" aria-hidden="true" />
              {enableBusy ? '启用中...' : '启用当前网站'}
            </button>
          ) : null}
          {enableDenied ? <p className="mt-3 text-xs font-medium text-red-200">权限未授予，此网站尚未启用。</p> : null}
        </section>

        <section className="rounded-[20px] border border-[#E5E7EB] bg-white p-4 shadow-[0_12px_28px_rgba(16,24,39,0.06)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">今日</h2>
            <Activity className="h-4 w-4 text-[#2F9B74]" aria-hidden="true" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="有效阅读" value={todayValue} icon={BookOpen} />
            <Metric label="阅读时间" value={timeValue} icon={Activity} />
            <Metric label="页面" value={pagesValue} icon={BookMarked} />
            <Metric label="学习中词汇" value={learningValue} icon={Languages} />
          </div>
          {loadFailed ? <p className="mt-3 text-xs font-medium text-red-700">本地数据暂时不可用。</p> : null}
        </section>

        <section className="rounded-[20px] border border-[#E5E7EB] bg-white p-4 shadow-[0_12px_28px_rgba(16,24,39,0.06)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">值得关注</h2>
            <Sparkles className="h-4 w-4 text-[#D8B46A]" aria-hidden="true" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {vocabulary.length > 0 ? (
              vocabulary.map((vocab) => (
                <span key={vocab.lemma} className="inline-flex items-center gap-1.5 rounded-full border border-[#DDE7DF] bg-[#F1F5F0] px-3 py-1.5 text-xs font-bold text-[#1F7A5B]">
                  <span className={`h-1.5 w-1.5 rounded-full ${vocab.userStatus === 'new' ? 'bg-[#3B82F6]' : vocab.userStatus === 'known' ? 'bg-[#9CA3AF]' : 'bg-[#2F9B74]'}`} />
                  {vocab.lemma}
                </span>
              ))
            ) : (
              <p className="rounded-[14px] border border-dashed border-[#D7DDD8] bg-[#F8FAF7] p-3 text-sm text-[#6B7280]">
                {detailsFailed ? '词汇数据暂时不可用。' : details ? '还没有值得关注的词汇。' : '正在读取词汇。'}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[20px] border border-[#E5E7EB] bg-white p-4 shadow-[0_12px_28px_rgba(16,24,39,0.06)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">摘录</h2>
            <Quote className="h-4 w-4 text-[#2F9B74]" aria-hidden="true" />
          </div>
          {savedItem ? (
            <figure className="mt-3 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAF7] p-3">
              <blockquote className="text-sm leading-6 text-[#111827]">“{savedItem.text}”</blockquote>
              <figcaption className="mt-3 text-xs font-semibold text-[#6B7280]">{savedItem.sourceDomain}</figcaption>
            </figure>
          ) : (
            <p className="mt-3 rounded-[18px] border border-dashed border-[#D7DDD8] bg-[#F8FAF7] p-3 text-sm text-[#6B7280]">
              {detailsFailed ? '摘录数据暂时不可用。' : details ? '还没有保存摘录。' : '正在读取摘录。'}
            </p>
          )}
        </section>
      </section>

      <section className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E5E7EB] bg-[#F7F5EF]/95 p-4 backdrop-blur">
        <div className="grid gap-2">
          <button
            type="button"
            disabled={shareCardBusy}
            onClick={() => void openDashboard('share-card')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#2F9B74] px-3 py-2.5 text-sm font-bold text-white shadow-[0_10px_22px_rgba(47,155,116,0.28)] hover:bg-[#1F7A5B] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {shareCardBusy ? '生成中...' : '生成今日卡片'}
          </button>
          <button
            type="button"
            disabled={dashboardBusy}
            onClick={() => void openDashboard()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#D7DDD8] bg-white px-3 py-2.5 text-sm font-bold text-[#111827] hover:border-[#2F9B74] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {dashboardBusy ? '打开中...' : '打开仪表盘'}
          </button>
          {dashboardFailed ? <p className="text-center text-xs text-red-700">仪表盘暂时不可用。</p> : null}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-[16px] border border-[#E5E7EB] bg-[#F8FAF7] p-3">
      <Icon className="h-4 w-4 text-[#2F9B74]" aria-hidden="true" />
      <p className="mt-2 text-[11px] font-semibold text-[#9CA3AF]">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[#111827]">{value}</p>
    </div>
  );
}

function formatStatusText(
  siteAccess: SiteAccessState | undefined,
  siteAccessFailed: boolean,
  summary: TodayReadingSummary | undefined,
  hasLoaded: boolean,
  loadFailed: boolean,
): string {
  if (siteAccessFailed || loadFailed) return '不可用';
  if (siteAccess?.supported && siteAccess.enabled) return '记录中';
  if (siteAccess?.supported && !siteAccess.enabled) return '未启用';
  if (summary?.hasData) return '已读取';
  if (hasLoaded) return '待开始';
  return '读取中';
}

function formatCurrentPageEmptyState(siteAccess: SiteAccessState | undefined): string {
  if (!siteAccess) return '正在读取当前页面';
  if (!siteAccess.supported) return '当前页面无法记录';
  if (!siteAccess.enabled) return '启用后显示本页输入';
  return '等待当前页面产生有效阅读';
}

function formatConfidence(confidence: number | undefined): string {
  if (confidence === undefined) return 'Confidence pending';
  if (confidence >= 0.7) return 'High confidence';
  if (confidence >= 0.4) return 'Medium confidence';
  return 'Low confidence';
}

function formatWords(words: number): string {
  return `${Math.round(words).toLocaleString()} words`;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatMinutes(minutes: number): string {
  if (minutes < 1 && minutes > 0) {
    return '<1 min';
  }

  return `${Math.round(minutes)} min`;
}
