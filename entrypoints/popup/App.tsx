import {
  BookOpen,
  ExternalLink,
  FileText,
  PanelRightOpen,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS } from '../../src/domain/checkIn';
import {
  applyReadingRecordingSettingsToSiteAccess,
  getCurrentTabSiteAccess,
  isUnsupportedPageAccess,
  type SiteAccessState,
} from '../../src/permissions/siteAccess';
import { setSiteReadingRecordingEnabled } from '../../src/storage/readingRecordingSettings';
import { getTodayReadingSummary, type TodayReadingSummary } from '../../src/storage/readingStats';
import { formatMinutes, formatWords } from '../../src/ui/formatters';
import {
  ActionButton,
  BrandLockup,
  InlineNotice,
  Metric,
  SectionHeader,
  StatusPill,
  SwitchControl,
} from '../../src/ui/primitives';

export interface PopupAppDependencies {
  getTodayReadingSummary: typeof getTodayReadingSummary;
  getCurrentTabSiteAccess: typeof getCurrentTabSiteAccess;
  setSiteReadingRecordingEnabled: typeof setSiteReadingRecordingEnabled;
  openDashboard: () => Promise<void>;
  openPdfReader: () => Promise<void>;
  openSidePanel: () => Promise<void>;
}

const defaultDependencies: PopupAppDependencies = {
  getTodayReadingSummary,
  getCurrentTabSiteAccess,
  setSiteReadingRecordingEnabled,
  openDashboard: async () => {
    await browser.tabs.create({ url: new URL('/dashboard.html', window.location.href).toString() });
  },
  openPdfReader: async () => {
    await browser.tabs.create({ url: new URL('/pdf-reader.html', window.location.href).toString() });
  },
  openSidePanel: openExtensionSidePanel,
};

export function PopupApp({ dependencies = defaultDependencies }: { dependencies?: PopupAppDependencies }) {
  const [summary, setSummary] = useState<TodayReadingSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [siteAccess, setSiteAccess] = useState<SiteAccessState>();
  const [siteAccessFailed, setSiteAccessFailed] = useState(false);
  const [siteRecordingStatus, setSiteRecordingStatus] = useState<
    'idle' | 'saving' | 'saved' | 'failed'
  >('idle');
  const [sidePanelBusy, setSidePanelBusy] = useState(false);
  const [sidePanelFailed, setSidePanelFailed] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [pdfReaderBusy, setPdfReaderBusy] = useState(false);
  const [pdfReaderFailed, setPdfReaderFailed] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    let mounted = true;

    void dependencies.getCurrentTabSiteAccess()
      .then((nextAccess) => {
        if (!mounted) return;
        setSiteAccess(nextAccess);
        setSiteAccessFailed(false);
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

  const openPdfReader = async () => {
    setPdfReaderBusy(true);
    setPdfReaderFailed(false);

    try {
      await dependencies.openPdfReader();
    } catch (error) {
      console.error('Failed to open Yuel PDF reader from popup', error);
      if (mountedRef.current) setPdfReaderFailed(true);
    } finally {
      if (mountedRef.current) setPdfReaderBusy(false);
    }
  };

  const updateCurrentSiteRecording = async (enabled: boolean) => {
    if (
      !siteAccess?.supported
      || !siteAccess.granted
      || !siteAccess.globalRecordingEnabled
      || siteRecordingStatus === 'saving'
    ) return;

    const previousAccess = siteAccess;
    setSiteRecordingStatus('saving');

    try {
      const settings = await dependencies.setSiteReadingRecordingEnabled(siteAccess.url, enabled);
      if (!mountedRef.current) return;
      setSiteAccess(applyReadingRecordingSettingsToSiteAccess(previousAccess, settings));
      setSiteRecordingStatus('saved');
    } catch (error) {
      console.error('Failed to save Yuel current site recording setting', error);
      if (!mountedRef.current) return;
      setSiteRecordingStatus('failed');
    }
  };

  const hasLoaded = Boolean(summary) || loadFailed;
  const currentSiteLoading = !siteAccess && !siteAccessFailed;
  const currentSiteUnavailable = siteAccessFailed || siteAccess?.supported === false;
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
            <StatusPill tone={formatSiteAccessTone(siteAccess, siteAccessFailed)}>
              {formatSiteAccessStatus(siteAccess, siteAccessFailed)}
            </StatusPill>
          </div>
          <p className="popup-current-site__detail">
            {formatSiteAccessDetail(siteAccess, siteAccessFailed)}
          </p>
          {siteAccess?.supported ? (
            <div className="popup-current-site__control">
              <div>
                <h2>记录此网站</h2>
                <p id="popup-site-recording-description">
                  {formatSiteRecordingControlDetail(siteAccess)}
                </p>
              </div>
              <SwitchControl
                id="popup-site-recording-enabled"
                label={`记录 ${siteAccess.host} 的英文阅读`}
                describedBy="popup-site-recording-description"
                checked={siteAccess.siteRecordingEnabled}
                disabled={
                  !siteAccess.granted
                  || !siteAccess.globalRecordingEnabled
                  || siteRecordingStatus === 'saving'
                }
                busy={siteRecordingStatus === 'saving'}
                status={siteRecordingStatus === 'saving'
                  ? '保存中'
                  : siteAccess.siteRecordingEnabled
                    ? '已开启'
                    : '已暂停'}
                onChange={(enabled) => void updateCurrentSiteRecording(enabled)}
              />
            </div>
          ) : null}
          {siteAccessFailed ? <InlineNotice tone="danger">权限状态暂时不可用。</InlineNotice> : null}
          {siteRecordingStatus === 'failed' ? (
            <InlineNotice tone="danger">网站记录设置保存失败，原设置未改变。</InlineNotice>
          ) : null}
          {siteRecordingStatus === 'saved' ? (
            <InlineNotice tone="positive">网站记录设置已保存。</InlineNotice>
          ) : null}
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
            icon={PanelRightOpen}
            disabled={sidePanelBusy || currentSiteUnavailable}
            aria-busy={sidePanelBusy}
            onClick={() => void openSidePanel()}
          >
            {currentSiteLoading
              ? '正在检查页面...'
              : currentSiteUnavailable
                ? isUnsupportedPageAccess(siteAccess) ? '当前页面不可用' : '无法确认当前页面'
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
          <ActionButton
            className="popup-destinations__pdf"
            type="button"
            variant="secondary"
            icon={FileText}
            disabled={pdfReaderBusy}
            aria-busy={pdfReaderBusy}
            onClick={() => void openPdfReader()}
          >
            {pdfReaderBusy ? '打开中...' : '打开 PDF 阅读器'}
          </ActionButton>
        </nav>
        {sidePanelFailed ? <InlineNotice tone="danger">侧栏暂时不可用。</InlineNotice> : null}
        {dashboardFailed ? <InlineNotice tone="danger">仪表盘暂时不可用。</InlineNotice> : null}
        {pdfReaderFailed ? <InlineNotice tone="danger">PDF 阅读器暂时不可用。</InlineNotice> : null}
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

function formatSiteAccessStatus(siteAccess: SiteAccessState | undefined, failed: boolean): string {
  if (failed) return '错误';
  if (!siteAccess) return '检查中';
  if (isUnsupportedPageAccess(siteAccess)) return '不可用';
  if (!siteAccess.supported) return '未知';
  if (siteAccess.disabledReason === 'global-paused') return '全部暂停';
  if (siteAccess.disabledReason === 'site-paused') return '本站暂停';
  if (!siteAccess.enabled) return '访问受限';
  if (siteAccess.collectorState === 'recording') return '记录中';
  if (siteAccess.collectorState === 'idle') return '未检测到英文';
  return '已启用';
}

function formatSiteAccessTone(
  siteAccess: SiteAccessState | undefined,
  failed: boolean,
): 'neutral' | 'positive' | 'warning' | 'danger' {
  if (failed) return 'danger';
  if (!siteAccess || !siteAccess.supported) return 'neutral';
  if (siteAccess.disabledReason === 'browser-restricted') return 'warning';
  if (!siteAccess.enabled) return 'neutral';
  return siteAccess.collectorState === 'recording' ? 'positive' : 'neutral';
}

function formatSiteAccessDetail(siteAccess: SiteAccessState | undefined, failed: boolean): string {
  if (failed) return '暂时无法读取当前页面权限状态。';
  if (!siteAccess) return '正在读取当前标签。';
  if (isUnsupportedPageAccess(siteAccess)) return '浏览器内部页面无法记录。';
  if (!siteAccess.supported) return '暂时无法确认当前标签页状态。';
  if (siteAccess.disabledReason === 'global-paused') return '全部网站的自动记录已暂停。';
  if (siteAccess.disabledReason === 'site-paused') return '此网站的自动记录已暂停。';
  if (!siteAccess.enabled) return 'Chrome 已限制此网站的访问权限。';
  if (siteAccess.collectorState === 'recording') return '正在记录此网站的英文阅读。';
  if (siteAccess.collectorState === 'idle') return '当前页面未检测到可记录的英文内容。';
  return '正在确认页面采集状态。';
}

function formatSiteRecordingControlDetail(
  siteAccess: Extract<SiteAccessState, { supported: true }>,
): string {
  if (!siteAccess.granted) return '需先在 Chrome 中开放此网站的访问权限。';
  if (!siteAccess.globalRecordingEnabled) return '全局记录已暂停，可在仪表盘的阅读档案中恢复。';
  return `仅影响 ${siteAccess.host}，不会删除已有记录。`;
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
