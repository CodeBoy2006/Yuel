import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ExternalLink,
  Globe2,
  PanelRightOpen,
  PauseCircle,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';

import {
  disableEnabledSite,
  enableCurrentTabSite,
  getCurrentTabSiteAccess,
  listEnabledSites,
  type EnabledSiteRecord,
  type SiteAccessState,
} from '../../src/permissions/siteAccess';
import { getTodayReadingSummary, type TodayReadingSummary } from '../../src/storage/readingStats';

const trackedHosts = ['MDN', 'GitHub', 'Medium', 'Wikipedia', 'arXiv'];

export interface PopupAppDependencies {
  getTodayReadingSummary: typeof getTodayReadingSummary;
  getCurrentTabSiteAccess: typeof getCurrentTabSiteAccess;
  listEnabledSites: typeof listEnabledSites;
  enableCurrentTabSite: typeof enableCurrentTabSite;
  disableEnabledSite: typeof disableEnabledSite;
  openDashboard: () => Promise<void>;
  openSidePanel: () => Promise<void>;
}

const defaultDependencies: PopupAppDependencies = {
  getTodayReadingSummary,
  getCurrentTabSiteAccess,
  listEnabledSites,
  enableCurrentTabSite,
  disableEnabledSite,
  openDashboard: async () => {
    await browser.tabs.create({ url: new URL('/dashboard.html', window.location.href).toString() });
  },
  openSidePanel: openExtensionSidePanel,
};

export function PopupApp({ dependencies = defaultDependencies }: { dependencies?: PopupAppDependencies }) {
  const [summary, setSummary] = useState<TodayReadingSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [siteAccess, setSiteAccess] = useState<SiteAccessState>();
  const [enabledSites, setEnabledSites] = useState<EnabledSiteRecord[]>([]);
  const [enabledSitesLoaded, setEnabledSitesLoaded] = useState(false);
  const [enabledSitesFailed, setEnabledSitesFailed] = useState(false);
  const [enabledSitesExpanded, setEnabledSitesExpanded] = useState(false);
  const [siteAccessBusy, setSiteAccessBusy] = useState(false);
  const [siteAccessDenied, setSiteAccessDenied] = useState(false);
  const [siteAccessFailed, setSiteAccessFailed] = useState(false);
  const [currentTabInjectionMissed, setCurrentTabInjectionMissed] = useState(false);
  const [sidePanelBusy, setSidePanelBusy] = useState(false);
  const [sidePanelFailed, setSidePanelFailed] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [removingOrigin, setRemovingOrigin] = useState<string>();
  const [removeFailed, setRemoveFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    void dependencies.getTodayReadingSummary()
      .then((nextSummary) => {
        if (!mounted) return;
        setSummary(nextSummary);
      })
      .catch((error) => {
        console.error('Failed to load Yuel reading stats', error);
        if (!mounted) return;
        setLoadFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [dependencies]);

  useEffect(() => {
    let mounted = true;

    void dependencies.getCurrentTabSiteAccess()
      .then((nextAccess) => {
        if (!mounted) return;
        setSiteAccess(nextAccess);
      })
      .catch((error) => {
        console.error('Failed to load Yuel site access state', error);
        if (!mounted) return;
        setSiteAccessFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [dependencies]);

  useEffect(() => {
    let mounted = true;

    void refreshEnabledSites().catch((error) => {
      console.error('Failed to load Yuel enabled sites', error);
      if (!mounted) return;
      setEnabledSitesFailed(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const refreshEnabledSites = async () => {
    setEnabledSites(await dependencies.listEnabledSites());
    setEnabledSitesLoaded(true);
    setEnabledSitesFailed(false);
  };

  const refreshEnabledSitesAfterAction = async () => {
    try {
      await refreshEnabledSites();
    } catch (error) {
      console.error('Failed to refresh Yuel enabled sites', error);
      setEnabledSitesFailed(true);
    }
  };

  const enableSite = async () => {
    setSiteAccessBusy(true);
    setSiteAccessDenied(false);
    setSiteAccessFailed(false);
    setEnabledSitesFailed(false);
    setCurrentTabInjectionMissed(false);
    setRemoveFailed(false);

    try {
      const result = await dependencies.enableCurrentTabSite();
      setSiteAccessDenied(result.supported && !result.granted && !result.enabled && !result.starterSite);
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
      setCurrentTabInjectionMissed(result.supported && result.enabled && !result.starterSite && !result.injected);
      await refreshEnabledSitesAfterAction();
    } catch (error) {
      console.error('Failed to enable Yuel on current site', error);
      setSiteAccessDenied(false);
      setSiteAccessFailed(true);
    } finally {
      setSiteAccessBusy(false);
    }
  };

  const removeEnabledSite = async (origin: string) => {
    setRemovingOrigin(origin);
    setSiteAccessDenied(false);
    setSiteAccessFailed(false);
    setEnabledSitesFailed(false);
    setCurrentTabInjectionMissed(false);
    setRemoveFailed(false);

    try {
      await dependencies.disableEnabledSite(origin);
      await refreshEnabledSitesAfterAction();
      setSiteAccess((currentAccess) =>
        currentAccess?.supported && currentAccess.origin === origin
          ? { ...currentAccess, granted: false, enabled: currentAccess.starterSite }
          : currentAccess,
      );
    } catch (error) {
      console.error('Failed to remove Yuel enabled site', error);
      setRemoveFailed(true);
    } finally {
      setRemovingOrigin(undefined);
    }
  };

  const openSidePanel = async () => {
    setSidePanelBusy(true);
    setSidePanelFailed(false);

    try {
      await dependencies.openSidePanel();
    } catch (error) {
      console.error('Failed to open Yuel side panel', error);
      setSidePanelFailed(true);
    } finally {
      setSidePanelBusy(false);
    }
  };

  const openDashboard = async () => {
    setDashboardBusy(true);
    setDashboardFailed(false);

    try {
      await dependencies.openDashboard();
    } catch (error) {
      console.error('Failed to open Yuel dashboard from popup', error);
      setDashboardFailed(true);
    } finally {
      setDashboardBusy(false);
    }
  };

  const hasLoaded = Boolean(summary) || loadFailed;
  const currentSiteEnabled = siteAccess?.supported ? siteAccess.enabled : false;
  const canEnableCurrentSite = Boolean(siteAccess?.supported && !siteAccess.enabled && !siteAccessBusy);
  const canPauseCurrentSite = Boolean(siteAccess?.supported && siteAccess.enabled && !siteAccess.starterSite && !siteAccessBusy);
  const showStarterSites = enabledSitesLoaded && enabledSites.length === 0 && (!summary?.hasData || siteAccess?.supported === false);
  const primaryAction = canEnableCurrentSite ? enableSite : openSidePanel;
  const primaryActionDisabled = canEnableCurrentSite ? siteAccessBusy : sidePanelBusy || !currentSiteEnabled;

  return (
    <main className="w-[360px] bg-[#F7F5EF] p-3 text-[#111827]">
      <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-4 shadow-[0_18px_45px_rgba(16,24,39,0.08)]">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#2F9B74]">Moonlight Reading</p>
            <h1 className="mt-1 text-xl font-bold">阅量 Yuel</h1>
            <p className="mt-1 text-xs text-[#6B7280]">本地优先的外语阅读追踪器</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-[#DDE7DF] bg-[#F1F5F0] px-2.5 py-1 text-[11px] font-semibold text-[#1F7A5B]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            本地保存
          </div>
        </header>

        <section className="mt-4 rounded-[20px] bg-[#101827] p-4 text-white shadow-[0_12px_30px_rgba(16,24,39,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#D8B46A]">当前站点</p>
              <h2 className="mt-2 truncate text-lg font-bold">{formatSiteAccessTitle(siteAccess, siteAccessFailed)}</h2>
            </div>
            <StatusChip label={formatSiteAccessStatus(siteAccess, siteAccessFailed, siteAccessDenied)} />
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-300">
            {currentTabInjectionMissed
              ? '已为后续页面启用，重新加载当前标签后开始记录。'
              : formatSiteAccessDetail(siteAccess, siteAccessBusy, siteAccessDenied)}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!canPauseCurrentSite}
              onClick={() => {
                if (siteAccess?.supported) {
                  void removeEnabledSite(siteAccess.origin);
                }
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:border-[#D8B46A] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <PauseCircle className="h-4 w-4" aria-hidden="true" />
              {canPauseCurrentSite ? (removingOrigin === (siteAccess?.supported ? siteAccess.origin : undefined) ? '暂停中...' : '暂停记录') : currentSiteEnabled ? '默认记录中' : '未启用'}
            </button>
          </div>
          {siteAccessFailed ? <p className="mt-3 text-xs font-medium text-red-200">权限状态暂时不可用。</p> : null}
          {removeFailed ? <p className="mt-3 text-xs font-medium text-red-200">移除失败，此网站仍保持启用。</p> : null}
        </section>

        <section className="mt-3 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAF7] p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#6B7280]">今日有效阅读</p>
            <BookOpen className="h-4 w-4 text-[#2F9B74]" aria-hidden="true" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric label="有效阅读" value={loadFailed ? '不可用' : summary ? formatWords(summary.effectiveWords) : '读取中'} />
            <Metric label="阅读时间" value={loadFailed ? '不可用' : summary?.hasData ? formatMinutes(summary.minutes) : hasLoaded ? '0 min' : '读取中'} />
            <Metric label="页面" value={loadFailed ? '不可用' : summary ? `${summary.readPages} pages` : '读取中'} />
            <Metric label="学习中词汇" value={loadFailed ? '不可用' : summary ? `${summary.learningWords} words` : '读取中'} />
          </div>
          {loadFailed ? <p className="mt-3 text-xs font-medium text-red-700">本地数据暂时不可用。</p> : null}
        </section>

        <section className="mt-3 grid gap-2">
          <button
            type="button"
            disabled={primaryActionDisabled}
            onClick={() => void primaryAction()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#2F9B74] px-3 py-2.5 text-sm font-bold text-white shadow-[0_10px_22px_rgba(47,155,116,0.28)] hover:bg-[#1F7A5B] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {canEnableCurrentSite ? (
              <Globe2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
            )}
            {canEnableCurrentSite ? (siteAccessBusy ? '启用中...' : '启用当前网站') : sidePanelBusy ? '打开中...' : '打开侧栏'}
          </button>
          <button
            type="button"
            disabled={dashboardBusy}
            onClick={() => void openDashboard()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#D7DDD8] bg-white px-3 py-2.5 text-sm font-bold text-[#111827] hover:border-[#2F9B74] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {dashboardBusy ? '打开中...' : '查看仪表盘'}
          </button>
          {sidePanelFailed ? <p className="text-center text-xs text-red-700">侧栏暂时不可用。</p> : null}
          {dashboardFailed ? <p className="text-center text-xs text-red-700">仪表盘暂时不可用。</p> : null}
        </section>

        {showStarterSites ? (
          <section className="mt-3 rounded-[16px] border border-dashed border-[#D7DDD8] bg-white p-3">
            <p className="text-xs font-semibold text-[#6B7280]">推荐开始记录</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {trackedHosts.map((host) => (
                <span key={host} className="rounded-full border border-[#DDE7DF] bg-[#F1F5F0] px-2.5 py-1 text-xs font-semibold text-[#1F7A5B]">
                  {host}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-3">
          <button
            type="button"
            onClick={() => setEnabledSitesExpanded((expanded) => !expanded)}
            className="flex w-full items-center justify-between rounded-[14px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm font-semibold text-[#111827] hover:border-[#2F9B74]"
          >
            <span>
              已启用网站{' '}
              <span className="text-[#6B7280]">
                {!enabledSitesLoaded && !enabledSitesFailed ? '读取中' : enabledSitesFailed ? '不可用' : `${enabledSites.length} 个`}
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 text-[#6B7280] transition ${enabledSitesExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {enabledSitesExpanded ? (
            <div className="mt-2 rounded-[16px] border border-[#E5E7EB] bg-[#F8FAF7] p-3">
              {!enabledSitesLoaded && !enabledSitesFailed ? (
                <p className="text-sm text-[#6B7280]">正在读取已启用网站。</p>
              ) : enabledSites.length > 0 ? (
                <div className="grid gap-2">
                  {enabledSites.map((site) => (
                    <div key={site.origin} className="flex items-center justify-between gap-2 rounded-[12px] bg-white px-3 py-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-[#111827]">{site.host}</span>
                      <button
                        type="button"
                        disabled={removingOrigin === site.origin}
                        onClick={() => void removeEnabledSite(site.origin)}
                        className="shrink-0 rounded-[10px] border border-[#E5E7EB] px-2.5 py-1 text-xs font-semibold text-[#6B7280] hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {removingOrigin === site.origin ? '移除中' : '移除'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : enabledSitesFailed ? null : (
                <p className="text-sm text-[#6B7280]">还没有手动启用的网站。</p>
              )}
              {enabledSitesFailed ? <p className="text-sm font-medium text-red-700">已启用网站暂时不可用。</p> : null}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-3">
      <p className="text-[11px] font-semibold text-[#9CA3AF]">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[#111827]">{value}</p>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-[#BCE9D8]">
      {label}
    </span>
  );
}

function formatWords(words: number): string {
  return `${Math.round(words).toLocaleString()} words`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1 && minutes > 0) {
    return '<1 min';
  }

  return `${Math.round(minutes)} min`;
}

function formatSiteAccessTitle(siteAccess: SiteAccessState | undefined, failed: boolean): string {
  if (failed) return '权限状态不可用';
  if (!siteAccess) return '正在检查页面';
  if (!siteAccess.supported) return '当前页面无法记录';
  return siteAccess.host;
}

function formatSiteAccessStatus(siteAccess: SiteAccessState | undefined, failed: boolean, denied = false): string {
  if (failed) return '错误';
  if (denied) return '未授权';
  if (!siteAccess) return '检查中';
  if (!siteAccess.supported) return '不可用';
  if (siteAccess.enabled) return '已启用';
  return '未启用';
}

function formatSiteAccessDetail(siteAccess: SiteAccessState | undefined, busy: boolean, denied = false): string {
  if (busy) return '正在请求当前网站的可选权限。';
  if (denied) return '权限未授予，此网站尚未启用。';
  if (!siteAccess) return '正在读取当前标签。';
  if (!siteAccess.supported) return 'Chrome 内部页面、商店页或空白页不可访问。';
  if (siteAccess.starterSite) return '这是默认记录站点，阅量会在本地记录英文阅读。';
  if (siteAccess.enabled) return '正在记录此网站的英文阅读。';
  if (siteAccess.granted) return '权限已授予，点击即可启用记录。';
  return '只为当前网站授予记录权限。';
}

async function openExtensionSidePanel(): Promise<void> {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: {
      sidePanel?: {
        open?: (options: { tabId?: number; windowId?: number }) => Promise<void>;
      };
      windows?: {
        WINDOW_ID_CURRENT?: number;
      };
    };
  }).chrome;

  if (chromeApi?.sidePanel?.open && typeof chromeApi.windows?.WINDOW_ID_CURRENT === 'number') {
    try {
      await chromeApi.sidePanel.open({ windowId: chromeApi.windows.WINDOW_ID_CURRENT });
      return;
    } catch (error) {
      console.warn('Failed to open Yuel side panel directly; falling back to sidepanel page', error);
    }
  }

  await browser.tabs.create({ url: new URL('/sidepanel.html', window.location.href).toString() });
}
