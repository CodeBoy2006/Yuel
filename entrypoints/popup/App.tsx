import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Globe2,
  PanelRightOpen,
  PauseCircle,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS } from '../../src/domain/checkIn';
import {
  disableEnabledSite,
  enableCurrentTabSite,
  getCurrentTabSiteAccess,
  isUnsupportedPageAccess,
  listEnabledSites,
  type EnabledSiteRecord,
  type SiteAccessState,
} from '../../src/permissions/siteAccess';
import { STARTER_SITE_LABELS } from '../../src/permissions/starterSites';
import { getTodayReadingSummary, type TodayReadingSummary } from '../../src/storage/readingStats';
import { formatMinutes, formatWords } from '../../src/ui/formatters';
import {
  ActionButton,
  BrandLockup,
  EmptyState,
  InlineNotice,
  Metric,
  SectionHeader,
  StatusPill,
} from '../../src/ui/primitives';

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
  const mountedRef = useRef(true);
  const enabledSitesRequestGenerationRef = useRef(0);
  const siteAccessRequestGenerationRef = useRef(0);
  const enabledSitesToggleRef = useRef<HTMLButtonElement>(null);
  const pendingRemovalFocusRef = useRef<{ preferredOrigin?: string } | undefined>(undefined);

  const refreshEnabledSites = useCallback(async (failureMessage: string): Promise<EnabledSiteRecord[] | undefined> => {
    const requestGeneration = ++enabledSitesRequestGenerationRef.current;

    try {
      const listedSites = await dependencies.listEnabledSites();
      if (!mountedRef.current || requestGeneration !== enabledSitesRequestGenerationRef.current) return undefined;

      setEnabledSites(listedSites);
      setEnabledSitesLoaded(true);
      setEnabledSitesFailed(false);
      return listedSites;
    } catch (error) {
      if (!mountedRef.current || requestGeneration !== enabledSitesRequestGenerationRef.current) return undefined;

      console.error(failureMessage, error);
      setEnabledSitesFailed(true);
      return undefined;
    }
  }, [dependencies]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      enabledSitesRequestGenerationRef.current += 1;
      siteAccessRequestGenerationRef.current += 1;
    };
  }, []);

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
    const requestGeneration = ++siteAccessRequestGenerationRef.current;

    void dependencies.getCurrentTabSiteAccess()
      .then((nextAccess) => {
        if (!mountedRef.current || requestGeneration !== siteAccessRequestGenerationRef.current) return;
        setSiteAccess(nextAccess);
        setSiteAccessFailed(false);
      })
      .catch((error) => {
        console.error('Failed to load Yuel site access state', error);
        if (!mountedRef.current || requestGeneration !== siteAccessRequestGenerationRef.current) return;
        setSiteAccessFailed(true);
      });

    return () => {
      if (requestGeneration === siteAccessRequestGenerationRef.current) {
        siteAccessRequestGenerationRef.current += 1;
      }
    };
  }, [dependencies]);

  useEffect(() => {
    void refreshEnabledSites('Failed to load Yuel enabled sites');
  }, [refreshEnabledSites]);

  useEffect(() => {
    const pendingFocus = pendingRemovalFocusRef.current;
    if (!pendingFocus || removingOrigin) return;

    pendingRemovalFocusRef.current = undefined;
    const preferredButton = pendingFocus.preferredOrigin
      ? Array.from(
          enabledSitesToggleRef.current
            ?.closest('.popup-app')
            ?.querySelectorAll<HTMLButtonElement>('[data-enabled-site-origin]') ?? [],
        ).find((button) => button.dataset.enabledSiteOrigin === pendingFocus.preferredOrigin)
      : undefined;
    (preferredButton ?? enabledSitesToggleRef.current)?.focus();
  }, [enabledSites, removingOrigin]);

  const enableSite = async () => {
    const accessGeneration = ++siteAccessRequestGenerationRef.current;
    setSiteAccessBusy(true);
    setSiteAccessDenied(false);
    setSiteAccessFailed(false);
    setEnabledSitesFailed(false);
    setCurrentTabInjectionMissed(false);
    setRemoveFailed(false);

    try {
      const result = await dependencies.enableCurrentTabSite();
      if (!mountedRef.current || accessGeneration !== siteAccessRequestGenerationRef.current) return;

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
      await refreshEnabledSites('Failed to refresh Yuel enabled sites');
    } catch (error) {
      console.error('Failed to enable Yuel on current site', error);
      if (!mountedRef.current || accessGeneration !== siteAccessRequestGenerationRef.current) return;

      setSiteAccessDenied(false);
      setSiteAccessFailed(true);
    } finally {
      if (mountedRef.current) setSiteAccessBusy(false);
    }
  };

  const removeEnabledSite = async (origin: string, focusSource: 'current-site' | 'enabled-sites') => {
    const accessGeneration = ++siteAccessRequestGenerationRef.current;
    setRemovingOrigin(origin);
    setSiteAccessDenied(false);
    setSiteAccessFailed(false);
    setEnabledSitesFailed(false);
    setCurrentTabInjectionMissed(false);
    setRemoveFailed(false);

    try {
      await dependencies.disableEnabledSite(origin);
      if (!mountedRef.current || accessGeneration !== siteAccessRequestGenerationRef.current) return;

      const previousIndex = enabledSites.findIndex((site) => site.origin === origin);
      const optimisticSites = enabledSites.filter((site) => site.origin !== origin);
      setEnabledSites(optimisticSites);
      setEnabledSitesLoaded(true);
      const [refreshedSites, refreshedAccess] = await Promise.all([
        refreshEnabledSites('Failed to refresh Yuel enabled sites'),
        dependencies.getCurrentTabSiteAccess()
          .then((access) => ({ access }))
          .catch((error: unknown) => ({ error })),
      ]);
      if (!mountedRef.current || accessGeneration !== siteAccessRequestGenerationRef.current) return;

      const remainingSites = refreshedSites ?? optimisticSites;
      const preferredSite = focusSource === 'enabled-sites' && remainingSites.length > 0
        ? remainingSites[Math.min(Math.max(previousIndex, 0), remainingSites.length - 1)]
        : undefined;
      pendingRemovalFocusRef.current = { preferredOrigin: preferredSite?.origin };
      if ('access' in refreshedAccess) {
        setSiteAccess(refreshedAccess.access);
        setSiteAccessFailed(false);
      } else {
        console.error('Failed to refresh Yuel site access after removal', refreshedAccess.error);
        setSiteAccessFailed(true);
        setSiteAccess((currentAccess) =>
          currentAccess?.supported && currentAccess.origin === origin
            ? { ...currentAccess, granted: false, enabled: currentAccess.starterSite }
            : currentAccess,
        );
      }
    } catch (error) {
      console.error('Failed to remove Yuel enabled site', error);
      if (mountedRef.current && accessGeneration === siteAccessRequestGenerationRef.current) setRemoveFailed(true);
    } finally {
      if (mountedRef.current) setRemovingOrigin(undefined);
    }
  };

  const openSidePanel = async () => {
    setSidePanelBusy(true);
    setSidePanelFailed(false);

    try {
      await dependencies.openSidePanel();
    } catch (error) {
      console.error('Failed to open Yuel side panel', error);
      if (mountedRef.current) setSidePanelFailed(true);
    } finally {
      if (mountedRef.current) setSidePanelBusy(false);
    }
  };

  const openDashboard = async () => {
    setDashboardBusy(true);
    setDashboardFailed(false);

    try {
      await dependencies.openDashboard();
    } catch (error) {
      console.error('Failed to open Yuel dashboard from popup', error);
      if (mountedRef.current) setDashboardFailed(true);
    } finally {
      if (mountedRef.current) setDashboardBusy(false);
    }
  };

  const hasLoaded = Boolean(summary) || loadFailed;
  const currentSiteEnabled = siteAccess?.supported ? siteAccess.enabled : false;
  const shouldEnableCurrentSite = Boolean(siteAccess?.supported && !siteAccess.enabled);
  const currentSiteOrigin = siteAccess?.supported ? siteAccess.origin : undefined;
  const isPausingCurrentSite = Boolean(currentSiteOrigin && removingOrigin === currentSiteOrigin);
  const canPauseCurrentSite = Boolean(
    siteAccess?.supported
      && siteAccess.enabled
      && !siteAccess.starterSite
      && !siteAccessBusy
      && !removingOrigin,
  );
  const showStarterSites = enabledSitesLoaded && enabledSites.length === 0 && (!summary?.hasData || siteAccess?.supported === false);
  const currentSiteLoading = !siteAccess && !siteAccessFailed;
  const currentSiteUnavailable = siteAccessFailed || siteAccess?.supported === false;
  // Keep the action identity stable while an async permission request is running.
  const primaryAction = shouldEnableCurrentSite ? enableSite : openSidePanel;
  const primaryActionDisabled = shouldEnableCurrentSite
    ? siteAccessBusy
    : siteAccessBusy || sidePanelBusy || currentSiteUnavailable || !currentSiteEnabled || isPausingCurrentSite;
  const siteStatus = formatSiteAccessStatus(siteAccess, siteAccessFailed, siteAccessDenied);
  const checkInThresholdWords = summary?.checkInThresholdWords ?? DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS;

  return (
    <main className="yuel-app popup-app">
      <section className="popup-shell" aria-label="阅量快捷控制">
        <header className="popup-header">
          <BrandLockup
            compact
            progress={summary ? {
              effectiveWords: summary.effectiveWords,
              thresholdWords: checkInThresholdWords,
              completed: summary.checkInCompleted,
            } : undefined}
            progressStatus={loadFailed ? 'unavailable' : 'loading'}
          />
          <span className="popup-local-state" title="阅读数据仅保存在本机">
            <ShieldCheck aria-hidden="true" />
            本地保存
          </span>
        </header>

        <section className="popup-current-site" aria-labelledby="popup-current-site-title">
          <div className="popup-current-site__heading">
            <div className="popup-current-site__identity">
              <span className="popup-eyebrow">当前站点</span>
              <h1 id="popup-current-site-title" title={formatSiteAccessTitle(siteAccess, siteAccessFailed)}>
                {formatSiteAccessTitle(siteAccess, siteAccessFailed)}
              </h1>
            </div>
            <StatusPill tone={formatSiteAccessTone(siteAccess, siteAccessFailed, siteAccessDenied)}>{siteStatus}</StatusPill>
          </div>
          <p className="popup-current-site__detail">
            {currentTabInjectionMissed
              ? '已为后续页面启用；刷新当前标签后开始记录。'
              : formatSiteAccessDetail(siteAccess, siteAccessBusy, siteAccessDenied, siteAccessFailed)}
          </p>
          {siteAccess?.supported && siteAccess.enabled && !siteAccess.starterSite ? (
            <ActionButton
              className="popup-pause-button"
              type="button"
              variant="quiet"
              icon={PauseCircle}
              disabled={!canPauseCurrentSite}
              aria-busy={isPausingCurrentSite}
              onClick={() => void removeEnabledSite(siteAccess.origin, 'current-site')}
            >
              {isPausingCurrentSite ? '暂停中...' : '暂停记录'}
            </ActionButton>
          ) : null}
          {siteAccessFailed ? <InlineNotice tone="danger">权限状态暂时不可用。</InlineNotice> : null}
          {removeFailed ? <InlineNotice tone="danger">移除失败，此网站仍保持启用。</InlineNotice> : null}
        </section>

        <section className="popup-today" aria-label="今日有效阅读">
          <SectionHeader icon={BookOpen} meta={summary?.date ?? '本地'}>
            今日有效阅读
          </SectionHeader>
          <div className="popup-metrics">
            <Metric label="有效阅读" value={loadFailed ? '不可用' : summary ? formatWords(summary.effectiveWords) : '读取中'} />
            <Metric label="阅读时间" value={loadFailed ? '不可用' : summary?.hasData ? formatMinutes(summary.minutes) : hasLoaded ? '0 分钟' : '读取中'} />
            <Metric label="页面" value={loadFailed ? '不可用' : summary ? `${summary.readPages} 页` : '读取中'} />
            <Metric label="学习中词汇" value={loadFailed ? '不可用' : summary ? `${summary.learningWords} 个` : '读取中'} />
          </div>
          {loadFailed ? <InlineNotice tone="danger">本地数据暂时不可用。</InlineNotice> : null}
        </section>

        <nav className="popup-destinations" aria-label="阅量页面">
          <ActionButton
            type="button"
            variant="primary"
            icon={shouldEnableCurrentSite ? Globe2 : PanelRightOpen}
            disabled={primaryActionDisabled}
            aria-busy={shouldEnableCurrentSite ? siteAccessBusy : sidePanelBusy}
            onClick={() => void primaryAction()}
          >
            {currentSiteLoading
              ? '正在检查页面...'
              : currentSiteUnavailable
                ? isUnsupportedPageAccess(siteAccess) ? '当前页面不可用' : '无法确认当前页面'
                : shouldEnableCurrentSite
              ? siteAccessBusy
                ? '启用中...'
                : '启用当前网站'
              : sidePanelBusy
                ? '打开中...'
                : '打开侧栏'}
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            icon={ExternalLink}
            disabled={dashboardBusy}
            aria-busy={dashboardBusy}
            onClick={() => void openDashboard()}
          >
            {dashboardBusy ? '打开中...' : '查看仪表盘'}
          </ActionButton>
        </nav>
        {sidePanelFailed ? <InlineNotice tone="danger">侧栏暂时不可用。</InlineNotice> : null}
        {dashboardFailed ? <InlineNotice tone="danger">仪表盘暂时不可用。</InlineNotice> : null}

        {showStarterSites ? (
          <section className="popup-starter-sites" aria-label="默认支持的网站">
            <span>默认支持</span>
            <p>{STARTER_SITE_LABELS.join(' · ')}</p>
          </section>
        ) : null}

        <section className="popup-sites">
          <button
            ref={enabledSitesToggleRef}
            className="popup-sites__toggle"
            type="button"
            aria-expanded={enabledSitesExpanded}
            aria-controls={enabledSitesExpanded ? 'popup-enabled-sites' : undefined}
            onClick={() => setEnabledSitesExpanded((expanded) => !expanded)}
          >
            <span>
              已启用网站{' '}
              <span>
                {!enabledSitesLoaded && !enabledSitesFailed ? '读取中' : enabledSitesFailed ? '不可用' : `${enabledSites.length} 个`}
              </span>
            </span>
            <ChevronDown className={enabledSitesExpanded ? 'is-expanded' : ''} aria-hidden="true" />
          </button>
          {enabledSitesExpanded ? (
            <div id="popup-enabled-sites" className="popup-sites__panel">
              {!enabledSitesLoaded && !enabledSitesFailed ? (
                <EmptyState>正在读取已启用网站。</EmptyState>
              ) : enabledSites.length > 0 ? (
                <ul className="popup-sites__list">
                  {enabledSites.map((site) => (
                    <li key={site.origin}>
                      <span title={site.host}>{site.host}</span>
                      <ActionButton
                        className="popup-site-remove"
                        type="button"
                        variant="quiet"
                        disabled={Boolean(removingOrigin)}
                        aria-busy={removingOrigin === site.origin}
                        aria-label={`${removingOrigin === site.origin ? '正在移除' : '移除'} ${site.host}`}
                        data-enabled-site-origin={site.origin}
                        onClick={() => void removeEnabledSite(site.origin, 'enabled-sites')}
                      >
                        {removingOrigin === site.origin ? '移除中' : '移除'}
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              ) : enabledSitesFailed ? null : (
                <EmptyState>还没有手动启用的网站。</EmptyState>
              )}
              {enabledSitesFailed ? <InlineNotice tone="danger">已启用网站暂时不可用。</InlineNotice> : null}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function formatSiteAccessTitle(siteAccess: SiteAccessState | undefined, failed: boolean): string {
  if (failed) return '权限状态不可用';
  if (!siteAccess) return '正在检查页面';
  if (isUnsupportedPageAccess(siteAccess)) return '当前页面无法记录';
  if (!siteAccess.supported) return '当前页面状态未知';
  return siteAccess.host;
}

function formatSiteAccessStatus(siteAccess: SiteAccessState | undefined, failed: boolean, denied = false): string {
  if (failed) return '错误';
  if (denied) return '未授权';
  if (!siteAccess) return '检查中';
  if (isUnsupportedPageAccess(siteAccess)) return '不可用';
  if (!siteAccess.supported) return '未知';
  if (siteAccess.enabled) return '已启用';
  return '未启用';
}

function formatSiteAccessTone(
  siteAccess: SiteAccessState | undefined,
  failed: boolean,
  denied = false,
): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (failed || denied) return 'danger';
  if (!siteAccess || !siteAccess.supported) return 'neutral';
  if (siteAccess.enabled) return 'positive';
  return 'warning';
}

function formatSiteAccessDetail(
  siteAccess: SiteAccessState | undefined,
  busy: boolean,
  denied = false,
  failed = false,
): string {
  if (busy) return '正在请求当前网站权限。';
  if (failed) return '暂时无法读取当前页面权限状态。';
  if (denied) return '权限未授予，此网站尚未启用。';
  if (!siteAccess) return '正在读取当前标签。';
  if (isUnsupportedPageAccess(siteAccess)) return '浏览器内部页面无法记录。';
  if (!siteAccess.supported) return '暂时无法确认当前标签页状态。';
  if (siteAccess.starterSite) return '默认记录站点，数据保存在本机。';
  if (siteAccess.enabled && siteAccess.collectorState === 'recording') return '正在记录此网站的英文阅读。';
  if (siteAccess.enabled && siteAccess.collectorState === 'idle') return '当前页面未检测到可记录的英文内容。';
  if (siteAccess.enabled) return '网站已启用，正在确认页面采集状态。';
  if (siteAccess.granted) return '权限已授予，可启用记录。';
  return '仅请求当前网站权限。';
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
