import {
  Activity,
  BookOpen,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  Gauge,
  Languages,
  LockKeyhole,
  Play,
  Quote,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { analyzeEnglishText } from '../../src/analysis/english';
import {
  DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS,
  MAX_DAILY_CHECK_IN_THRESHOLD_WORDS,
  MIN_DAILY_CHECK_IN_THRESHOLD_WORDS,
  isValidDailyCheckInThresholdWords,
} from '../../src/domain/checkIn';
import { saveDailyCheckInThresholdWords } from '../../src/storage/checkInSettings';
import { clearLocalReadingData } from '../../src/storage/repositories';
import {
  getReadingPaceSummary,
  saveOnboardingReadingPaceCalibration,
  type ReadingPaceSummary,
} from '../../src/storage/readingPace';
import {
  getReadingDashboardDetails,
  type ReadingDashboardDetails,
  type RecentPageSummary,
  type RecentSavedItemSummary,
  type RecentVocabularySummary,
} from '../../src/storage/readingStats';
import {
  DEFAULT_SHARE_CARD_SETTINGS,
  SHARE_CARD_SITE_LIMITS,
  getShareCardSettings,
  saveShareCardSettings,
  type ShareCardSettings,
} from '../../src/storage/shareCardSettings';
import {
  formatCount,
  formatDateTime,
  formatMinutes,
  formatVocabularyStatus,
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
} from '../../src/ui/primitives';
import { exportSummaryCardPng as exportSummaryCardImage } from '../../src/ui/shareCardImage';
import { createShareCardContent, createShareCardCopyText } from '../../src/ui/shareCardContent';
import { getWebsiteFaviconUrl, SiteFavicon } from '../../src/ui/siteFavicon';
import {
  getShareCardTheme,
  ShareCardCarousel,
  type ShareCardThemeId,
} from './ShareCardCarousel';
import { ReadingInsights } from './ReadingInsights';

export interface DashboardAppDependencies {
  getReadingDashboardDetails: typeof getReadingDashboardDetails;
  clearLocalReadingData: typeof clearLocalReadingData;
  confirmClearLocalReadingData: () => boolean;
  copyTextToClipboard: (text: string) => Promise<void>;
  exportSummaryCardPng: (element: HTMLElement, filename: string) => Promise<unknown>;
  getWebsiteFaviconUrl: (domain: string) => string | undefined;
  getReadingPaceSummary: typeof getReadingPaceSummary;
  getShareCardSettings: typeof getShareCardSettings;
  saveOnboardingReadingPaceCalibration: typeof saveOnboardingReadingPaceCalibration;
  saveDailyCheckInThresholdWords: typeof saveDailyCheckInThresholdWords;
  saveShareCardSettings: typeof saveShareCardSettings;
}

const defaultDependencies: DashboardAppDependencies = {
  clearLocalReadingData,
  confirmClearLocalReadingData: () =>
    window.confirm('清空所有阅量本地阅读数据？已启用网站和浏览器权限会保留。'),
  copyTextToClipboard,
  exportSummaryCardPng: exportDashboardSummaryCardPng,
  getWebsiteFaviconUrl,
  getReadingDashboardDetails,
  getReadingPaceSummary,
  getShareCardSettings,
  saveDailyCheckInThresholdWords,
  saveOnboardingReadingPaceCalibration,
  saveShareCardSettings,
};

type DashboardViewState = 'loading' | 'error' | 'empty' | 'ready';
type CalibrationStep = 'idle' | 'reading' | 'questions';

export function DashboardApp({ dependencies = defaultDependencies }: { dependencies?: DashboardAppDependencies }) {
  const [details, setDetails] = useState<ReadingDashboardDetails>();
  const [paceSummary, setPaceSummary] = useState<ReadingPaceSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [paceLoadFailed, setPaceLoadFailed] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const [clearRefreshFailed, setClearRefreshFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded' | 'failed'>('idle');
  const [shareCardOpen, setShareCardOpen] = useState(() => window.location.hash === '#share-card');
  const [shareCardSettings, setShareCardSettings] = useState<ShareCardSettings>(DEFAULT_SHARE_CARD_SETTINGS);
  const [shareCardSettingsStatus, setShareCardSettingsStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'failed'>('loading');
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>('idle');
  const [calibrationStartedAt, setCalibrationStartedAt] = useState<number>();
  const [calibrationReadingFinishedAt, setCalibrationReadingFinishedAt] = useState<number>();
  const [calibrationAnswers, setCalibrationAnswers] = useState<Record<string, string>>({});
  const [calibrationSaveStatus, setCalibrationSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'rejected' | 'failed'>('idle');
  const [checkInGoalEditing, setCheckInGoalEditing] = useState(false);
  const [checkInGoalInput, setCheckInGoalInput] = useState(String(DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS));
  const [checkInGoalSaveStatus, setCheckInGoalSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'invalid' | 'failed'>('idle');
  const dashboardRootRef = useRef<HTMLElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const checkInGoalInputRef = useRef<HTMLInputElement>(null);
  const calibrationSessionRef = useRef(0);
  const pendingCalibrationFocusRef = useRef<{ id: string; scrollContainerId?: string } | undefined>(undefined);
  const mountedRef = useRef(false);
  const detailsRefreshSequenceRef = useRef(0);
  const paceRefreshSequenceRef = useRef(0);
  const shareActionSequenceRef = useRef(0);
  const shareActionBusyRef = useRef(false);
  const shareCardSettingsSequenceRef = useRef(0);
  const shareCardSettingsTouchedRef = useRef(false);
  const resumeRefreshScheduledRef = useRef(false);
  const clearBusyRef = useRef(false);

  const refreshDashboard = useCallback(async (): Promise<{ detailsLoaded: boolean; paceLoaded: boolean }> => {
    const detailsRequestId = ++detailsRefreshSequenceRef.current;
    const paceRequestId = ++paceRefreshSequenceRef.current;
    const isCurrentDetailsRequest = () => mountedRef.current && detailsRequestId === detailsRefreshSequenceRef.current;
    const isCurrentPaceRequest = () => mountedRef.current && paceRequestId === paceRefreshSequenceRef.current;
    let detailsLoaded = false;
    let paceLoaded = false;

    await Promise.all([
      dependencies.getReadingDashboardDetails()
        .then((nextDetails) => {
          detailsLoaded = true;
          if (!isCurrentDetailsRequest()) return;
          setDetails(nextDetails);
          setLoadFailed(false);
        })
        .catch((error) => {
          console.error('Failed to load Yuel dashboard details', error);
          if (!isCurrentDetailsRequest()) return;
          setLoadFailed(true);
        }),
      dependencies.getReadingPaceSummary()
        .then((nextPaceSummary) => {
          paceLoaded = true;
          if (!isCurrentPaceRequest()) return;
          setPaceSummary(nextPaceSummary);
          setPaceLoadFailed(false);
        })
        .catch((error) => {
          console.error('Failed to load Yuel reading pace summary', error);
          if (!isCurrentPaceRequest()) return;
          setPaceLoadFailed(true);
        }),
    ]);

    return { detailsLoaded, paceLoaded };
  }, [dependencies]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshDashboard();

    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible' || clearBusyRef.current || resumeRefreshScheduledRef.current) return;
      resumeRefreshScheduledRef.current = true;
      queueMicrotask(() => {
        resumeRefreshScheduledRef.current = false;
        if (mountedRef.current && document.visibilityState === 'visible' && !clearBusyRef.current) {
          void refreshDashboard();
        }
      });
    };

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      mountedRef.current = false;
      detailsRefreshSequenceRef.current += 1;
      paceRefreshSequenceRef.current += 1;
      shareActionSequenceRef.current += 1;
      shareActionBusyRef.current = false;
      shareCardSettingsSequenceRef.current += 1;
      calibrationSessionRef.current += 1;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshDashboard]);

  useEffect(() => {
    const requestId = ++shareCardSettingsSequenceRef.current;
    setShareCardSettingsStatus('loading');

    void dependencies.getShareCardSettings()
      .then((settings) => {
        if (
          !mountedRef.current
          || requestId !== shareCardSettingsSequenceRef.current
          || shareCardSettingsTouchedRef.current
        ) return;
        setShareCardSettings(settings);
        setShareCardSettingsStatus('saved');
      })
      .catch((error) => {
        console.error('Failed to load Yuel share card settings', error);
        if (!mountedRef.current || requestId !== shareCardSettingsSequenceRef.current) return;
        setShareCardSettingsStatus('failed');
      });
  }, [dependencies.getShareCardSettings]);

  useEffect(() => {
    if (!shareCardOpen || !details?.hasData || window.location.hash !== '#share-card') return;
    window.requestAnimationFrame?.(() => {
      dashboardRootRef.current?.querySelector<HTMLElement>('#share-card')?.scrollIntoView({ block: 'start' });
      dashboardRootRef.current?.querySelector<HTMLElement>('#share-card-title')?.focus({ preventScroll: true });
    });
  }, [details?.hasData, shareCardOpen]);

  useEffect(() => {
    const pendingFocus = pendingCalibrationFocusRef.current;
    if (!pendingFocus) return;
    pendingCalibrationFocusRef.current = undefined;

    if (pendingFocus.scrollContainerId) {
      dashboardRootRef.current
        ?.querySelector<HTMLElement>(`#${pendingFocus.scrollContainerId}`)
        ?.scrollIntoView({ block: 'start' });
    }
    dashboardRootRef.current?.querySelector<HTMLElement>(`#${pendingFocus.id}`)?.focus({ preventScroll: true });
  }, [calibrationSaveStatus, calibrationStep]);

  const summary = details?.summary;
  const checkInThresholdWords = summary?.checkInThresholdWords ?? DEFAULT_DAILY_CHECK_IN_THRESHOLD_WORDS;
  const checkInCompleted = summary ? summary.checkInCompleted : false;
  const checkInEffectiveWords = Math.floor(Math.max(0, summary?.effectiveWords ?? 0));
  const checkInRemainingWords = summary
    ? Math.max(0, Math.ceil(checkInThresholdWords - summary.effectiveWords))
    : checkInThresholdWords;

  useEffect(() => {
    if (!checkInGoalEditing && checkInGoalSaveStatus !== 'saving') {
      setCheckInGoalInput(String(checkInThresholdWords));
    }
  }, [checkInGoalEditing, checkInGoalSaveStatus, checkInThresholdWords]);

  useEffect(() => {
    if (shareCardOpen && summary && !checkInCompleted) {
      setShareCardOpen(false);
    }
  }, [checkInCompleted, shareCardOpen, summary]);

  const hasStaleDetails = loadFailed && Boolean(details);
  const viewState: DashboardViewState = loadFailed && !details ? 'error' : !details ? 'loading' : details.hasData ? 'ready' : 'empty';
  const statusText = hasStaleDetails
    ? '显示上次读取结果'
    : viewState === 'error'
    ? '本地数据不可用'
    : viewState === 'loading'
      ? '正在读取本地数据'
      : viewState === 'empty'
        ? '等待第一条记录'
        : '本地数据已读取';
  const statusTone = hasStaleDetails ? 'warning' : viewState === 'error' ? 'danger' : viewState === 'ready' ? 'positive' : 'neutral';
  const effectiveWordsValue = summary ? formatCount(summary.effectiveWords) : '—';
  const readingTimeValue = summary ? formatMinutes(summary.minutes) : '—';
  const pagesTodayValue = summary ? String(summary.readPages) : '—';
  const learningWordsValue = summary ? String(summary.learningWords) : '—';
  const readingPaceValue = paceSummary ? `${Math.round(paceSummary.baseWordsPerMinute)} WPM` : paceLoadFailed ? '不可用' : '—';
  const readingPaceLabel = paceSummary
    ? `${formatPaceSource(paceSummary)}${paceLoadFailed ? ' · 刷新失败，保留上次结果。' : ''}`
    : paceLoadFailed
      ? '阅读速度不可用'
      : '正在读取阅读速度';
  const allCalibrationQuestionsAnswered = paceCalibrationQuestions.every((question) => calibrationAnswers[question.id]);
  const shareCardContent = summary && checkInCompleted ? createShareCardContent(summary) : undefined;
  const todayDomain = shareCardContent?.domains[0] ?? '暂无今日网站';
  const shareActionBusy = copyStatus === 'copying' || downloadStatus === 'downloading';
  const selectedShareCardTheme = shareCardSettings.theme;
  const selectedShareCardStyle = getShareCardTheme(selectedShareCardTheme);
  const insightHistory = details?.history ?? [];

  const retryLoading = () => {
    setDetails(undefined);
    setLoadFailed(false);
    void refreshDashboard();
  };

  const openCheckInGoalEditor = () => {
    setCheckInGoalInput(String(checkInThresholdWords));
    setCheckInGoalSaveStatus('idle');
    setCheckInGoalEditing(true);
    window.requestAnimationFrame?.(() => {
      scrollToSection(dashboardRootRef.current, 'reading-profile');
      checkInGoalInputRef.current?.focus({ preventScroll: true });
      checkInGoalInputRef.current?.select();
    });
  };

  const cancelCheckInGoalEditor = () => {
    setCheckInGoalInput(String(checkInThresholdWords));
    setCheckInGoalSaveStatus('idle');
    setCheckInGoalEditing(false);
    window.requestAnimationFrame?.(() => {
      dashboardRootRef.current
        ?.querySelector<HTMLButtonElement>('#check-in-goal-trigger')
        ?.focus({ preventScroll: true });
    });
  };

  const persistCheckInGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checkInGoalSaveStatus === 'saving') return;

    const nextThresholdWords = Number(checkInGoalInput);
    if (!isValidDailyCheckInThresholdWords(nextThresholdWords)) {
      setCheckInGoalSaveStatus('invalid');
      checkInGoalInputRef.current?.focus();
      return;
    }

    setCheckInGoalSaveStatus('saving');
    try {
      await dependencies.saveDailyCheckInThresholdWords(nextThresholdWords);
      if (!mountedRef.current) return;

      await refreshDashboard();
      if (!mountedRef.current) return;

      setCheckInGoalEditing(false);
      setCheckInGoalSaveStatus('saved');
      window.requestAnimationFrame?.(() => {
        dashboardRootRef.current
          ?.querySelector<HTMLButtonElement>('#check-in-goal-trigger')
          ?.focus({ preventScroll: true });
      });
    } catch (error) {
      console.error('Failed to save Yuel daily check-in goal', error);
      if (!mountedRef.current) return;
      setCheckInGoalSaveStatus('failed');
    }
  };

  const clearData = async () => {
    if (!dependencies.confirmClearLocalReadingData()) return;

    clearBusyRef.current = true;
    detailsRefreshSequenceRef.current += 1;
    paceRefreshSequenceRef.current += 1;
    setClearBusy(true);
    setClearFailed(false);
    setClearRefreshFailed(false);
    setLoadFailed(false);
    setPaceLoadFailed(false);
    setCopyStatus('idle');
    setDownloadStatus('idle');
    shareActionSequenceRef.current += 1;
    shareActionBusyRef.current = false;
    resetCalibration();

    try {
      await dependencies.clearLocalReadingData();
      if (!mountedRef.current) return;

      setDetails(undefined);
      setPaceSummary(undefined);
      const refreshResult = await refreshDashboard();
      if (!mountedRef.current) return;

      setClearRefreshFailed(!refreshResult.detailsLoaded);
      if (!refreshResult.paceLoaded) {
        setPaceLoadFailed(true);
      }
    } catch (error) {
      console.error('Failed to clear Yuel local data', error);
      if (!mountedRef.current) return;
      setClearFailed(true);
      if (!details) {
        void refreshDashboard();
      }
    } finally {
      clearBusyRef.current = false;
      if (mountedRef.current) {
        setClearBusy(false);
      }
    }
  };

  const copyShareCard = async () => {
    if (viewState !== 'ready' || !shareCardContent || shareActionBusyRef.current) return;
    const actionId = ++shareActionSequenceRef.current;
    shareActionBusyRef.current = true;
    setCopyStatus('copying');

    try {
      await dependencies.copyTextToClipboard(createShareCardCopyText(shareCardContent, shareCardSettings));
      if (!mountedRef.current || actionId !== shareActionSequenceRef.current) return;
      setCopyStatus('copied');
    } catch (error) {
      console.error('Failed to copy Yuel share card text', error);
      if (!mountedRef.current || actionId !== shareActionSequenceRef.current) return;
      setCopyStatus('failed');
    } finally {
      if (actionId === shareActionSequenceRef.current) {
        shareActionBusyRef.current = false;
      }
    }
  };

  const downloadShareCard = async () => {
    if (viewState !== 'ready' || !details || !shareCardRef.current || shareActionBusyRef.current) return;
    const actionId = ++shareActionSequenceRef.current;
    shareActionBusyRef.current = true;
    setDownloadStatus('downloading');

    try {
      await dependencies.exportSummaryCardPng(
        shareCardRef.current,
        `yuel-reading-${details.summary.date}-${selectedShareCardTheme}.png`,
      );
      if (!mountedRef.current || actionId !== shareActionSequenceRef.current) return;
      setDownloadStatus('downloaded');
    } catch (error) {
      console.error('Failed to export Yuel share card PNG', error);
      if (!mountedRef.current || actionId !== shareActionSequenceRef.current) return;
      setDownloadStatus('failed');
    } finally {
      if (actionId === shareActionSequenceRef.current) {
        shareActionBusyRef.current = false;
      }
    }
  };

  const applyShareCardSettings = (nextSettings: ShareCardSettings) => {
    if (shareActionBusyRef.current) return;

    shareCardSettingsTouchedRef.current = true;
    shareActionSequenceRef.current += 1;
    setCopyStatus('idle');
    setDownloadStatus('idle');
    setShareCardSettings(nextSettings);
    setShareCardSettingsStatus('saving');

    const requestId = ++shareCardSettingsSequenceRef.current;
    void Promise.resolve()
      .then(() => dependencies.saveShareCardSettings(nextSettings))
      .then((savedSettings) => {
        if (!mountedRef.current || requestId !== shareCardSettingsSequenceRef.current) return;
        setShareCardSettings(savedSettings);
        setShareCardSettingsStatus('saved');
      })
      .catch((error) => {
        console.error('Failed to save Yuel share card settings', error);
        if (!mountedRef.current || requestId !== shareCardSettingsSequenceRef.current) return;
        setShareCardSettingsStatus('failed');
      });
  };

  const selectShareCardTheme = (theme: ShareCardThemeId) => {
    if (shareActionBusyRef.current || theme === selectedShareCardTheme) return;
    applyShareCardSettings({ ...shareCardSettings, theme });
  };

  const startPaceCalibration = () => {
    calibrationSessionRef.current += 1;
    pendingCalibrationFocusRef.current = {
      id: 'pace-calibration-reading-title',
      scrollContainerId: 'pace-calibration',
    };
    setCalibrationStartedAt(Date.now());
    setCalibrationReadingFinishedAt(undefined);
    setCalibrationAnswers({});
    setCalibrationStep('reading');
    setCalibrationSaveStatus('idle');
  };

  function resetCalibration(restoreFocus = false) {
    calibrationSessionRef.current += 1;
    setCalibrationStep('idle');
    setCalibrationStartedAt(undefined);
    setCalibrationReadingFinishedAt(undefined);
    setCalibrationAnswers({});
    setCalibrationSaveStatus('idle');
    if (restoreFocus) {
      pendingCalibrationFocusRef.current = { id: 'pace-calibration-trigger' };
    }
  }

  const cancelPaceCalibration = () => resetCalibration(true);

  const finishPaceReading = () => {
    if (calibrationStartedAt === undefined) return;
    pendingCalibrationFocusRef.current = { id: 'pace-calibration-questions-title' };
    setCalibrationReadingFinishedAt(Date.now());
    setCalibrationStep('questions');
  };

  const savePaceCalibrationResult = async () => {
    if (
      calibrationStartedAt === undefined
      || calibrationReadingFinishedAt === undefined
      || !allCalibrationQuestionsAnswered
    ) return;

    const correctAnswers = paceCalibrationQuestions.filter((question) => calibrationAnswers[question.id] === question.correctOptionId).length;
    const sessionId = calibrationSessionRef.current;
    paceRefreshSequenceRef.current += 1;
    setCalibrationSaveStatus('saving');

    try {
      const nextPaceSummary = await dependencies.saveOnboardingReadingPaceCalibration({
        language: 'en',
        contentType: 'general',
        wordCount: PACE_CALIBRATION_WORD_COUNT,
        startedAt: calibrationStartedAt,
        completedAt: calibrationReadingFinishedAt,
        correctAnswers,
        questionCount: paceCalibrationQuestions.length,
      });
      if (!mountedRef.current || sessionId !== calibrationSessionRef.current) return;
      paceRefreshSequenceRef.current += 1;
      setPaceSummary(nextPaceSummary);
      pendingCalibrationFocusRef.current = { id: 'pace-calibration-trigger' };
      setCalibrationStep('idle');
      setCalibrationStartedAt(undefined);
      setCalibrationReadingFinishedAt(undefined);
      setCalibrationSaveStatus(nextPaceSummary.calibrationAccepted === false ? 'rejected' : 'saved');
    } catch (error) {
      console.error('Failed to save Yuel reading pace calibration', error);
      if (!mountedRef.current || sessionId !== calibrationSessionRef.current) return;
      setCalibrationSaveStatus('failed');
    }
  };

  return (
    <main ref={dashboardRootRef} className="yuel-app dashboard-app" aria-busy={viewState === 'loading'}>
      <header className="dashboard-header">
        <div className="dashboard-header__inner">
          <BrandLockup
            progress={summary ? {
              effectiveWords: summary.effectiveWords,
              thresholdWords: checkInThresholdWords,
              completed: checkInCompleted,
            } : undefined}
            progressStatus={viewState === 'error' ? 'unavailable' : 'loading'}
          />
          <nav className="dashboard-header__nav" aria-label="页面区段">
            {viewState === 'ready' ? (
              <button type="button" onClick={() => scrollToSection(dashboardRootRef.current, 'reading-insights')}>
                <Activity aria-hidden="true" />
                阅读节律
              </button>
            ) : null}
            <button type="button" onClick={() => scrollToSection(dashboardRootRef.current, 'reading-profile')}>
              <Gauge aria-hidden="true" />
              阅读档案
            </button>
            <button type="button" onClick={() => scrollToSection(dashboardRootRef.current, 'local-data')}>
              <SlidersHorizontal aria-hidden="true" />
              数据管理
            </button>
          </nav>
        </div>
      </header>

      <div className="dashboard-shell">
        <section className="dashboard-intro" aria-labelledby="dashboard-title">
          <div>
            <p className="dashboard-kicker">阅读记录</p>
            <h1 id="dashboard-title">阅读输入仪表盘</h1>
            <p>今天读了什么，留下了什么。</p>
          </div>
          <StatusPill tone={statusTone}>{statusText}</StatusPill>
        </section>

        {clearFailed ? <InlineNotice tone="danger">清空失败，本地数据未改变。</InlineNotice> : null}
        {clearRefreshFailed ? <InlineNotice tone="danger">本地数据已清空，但仪表盘刷新失败。</InlineNotice> : null}
        {hasStaleDetails ? <InlineNotice tone="warning">刷新失败，当前显示上次成功读取的本地数据。</InlineNotice> : null}

        {viewState === 'loading' ? <DashboardLoading /> : null}

        {viewState === 'error' ? (
          <section className="dashboard-state" aria-labelledby="dashboard-error-title">
            <div>
              <p className="dashboard-kicker">读取失败</p>
              <h2 id="dashboard-error-title">本地数据不可用</h2>
              <p>数据仍保留在浏览器中。</p>
            </div>
            <ActionButton icon={RotateCcw} onClick={retryLoading}>重新读取</ActionButton>
          </section>
        ) : null}

        {viewState === 'empty' ? (
          <section className="dashboard-state dashboard-state--empty" aria-labelledby="dashboard-empty-title">
            <div>
              <p className="dashboard-kicker">尚未开始</p>
              <h2 id="dashboard-empty-title">从下一篇外语文章开始</h2>
              <p>启用一个网站，阅读记录会自动汇入这里。</p>
            </div>
            <ActionButton icon={Gauge} onClick={() => scrollToSection(dashboardRootRef.current, 'reading-profile')}>先校准阅读速度</ActionButton>
          </section>
        ) : null}

        {viewState === 'ready' && details ? (
          <>
            <section className="today-ledger" aria-labelledby="today-reading-title">
              <div className="today-ledger__header">
                <div className="today-ledger__identity">
                  <p className="dashboard-kicker">{summary?.date}</p>
                  <h2 id="today-reading-title">今日有效阅读</h2>
                  <p className="today-ledger__domain" title={todayDomain}>{todayDomain}</p>
                </div>
                <div className="today-ledger__actions">
                  <ActionButton
                    variant="quiet"
                    icon={SlidersHorizontal}
                    onClick={openCheckInGoalEditor}
                  >
                    设置目标
                  </ActionButton>
                  <ActionButton
                    variant="quiet"
                    icon={Share2}
                    disabled={!checkInCompleted}
                    title={checkInCompleted ? undefined : `还差 ${formatCount(checkInRemainingWords)} 词完成今日打卡`}
                    aria-expanded={checkInCompleted ? shareCardOpen : false}
                    aria-controls={checkInCompleted && shareCardOpen ? 'share-card' : undefined}
                    onClick={() => setShareCardOpen((open) => !open)}
                  >
                    {checkInCompleted
                      ? shareCardOpen ? '收起今日卡片' : '查看今日卡片'
                      : '达标后可打卡'}
                  </ActionButton>
                </div>
              </div>
              <div className="today-ledger__goal">
                <div className="today-ledger__goal-heading">
                  <StatusPill tone={checkInCompleted ? 'positive' : 'warning'}>
                    {checkInCompleted ? '今日已打卡' : '今日未达标'}
                  </StatusPill>
                  <span>
                    {formatCount(checkInEffectiveWords)} / {formatCount(checkInThresholdWords)} 有效词
                  </span>
                </div>
                <ProgressBar
                  label="今日打卡进度"
                  value={summary?.effectiveWords ?? 0}
                  max={checkInThresholdWords}
                  valueText={checkInCompleted
                    ? `已完成今日打卡目标，共 ${formatCount(checkInEffectiveWords)} 词`
                    : `还差 ${formatCount(checkInRemainingWords)} 词完成今日打卡`}
                />
                <p>
                  {checkInCompleted
                    ? `已达到每日 ${formatCount(checkInThresholdWords)} 词目标。`
                    : `再读 ${formatCount(checkInRemainingWords)} 个有效词，才会计入连续打卡。`}
                </p>
              </div>
              <div className="today-ledger__metrics">
                <Metric icon={BookOpen} label="有效阅读" value={`${effectiveWordsValue} 词`} />
                <Metric icon={Activity} label="阅读时间" value={readingTimeValue} />
                <Metric icon={Database} label="今日页面" value={pagesTodayValue} />
                <Metric icon={Languages} label="学习中词汇" value={learningWordsValue} />
                <Metric icon={BookOpen} label="连续打卡" value={`${summary?.streak ?? 0} 天`} />
              </div>
            </section>

            {shareCardOpen && checkInCompleted ? (
              <section id="share-card" className="dashboard-panel share-section" aria-labelledby="share-card-title">
                <SectionHeader icon={Share2} meta="4 款 · 手动切换">
                  <span id="share-card-title" tabIndex={-1}>今日打卡卡片</span>
                </SectionHeader>
                <div className="share-section__layout">
                  {shareCardContent ? (
                    <ShareCardCarousel
                      cardRef={shareCardRef}
                      content={shareCardContent}
                      disabled={shareActionBusy}
                      onThemeChange={selectShareCardTheme}
                      resolveFaviconUrl={dependencies.getWebsiteFaviconUrl}
                      selectedTheme={selectedShareCardTheme}
                      settings={shareCardSettings}
                    />
                  ) : null}
                  <aside className="share-section__actions" aria-label="打卡卡片操作">
                    <div className="share-section__action-copy">
                      <span>当前样式</span>
                      <h3>{selectedShareCardStyle.name}</h3>
                      <p aria-live="polite">导出会使用当前选择的卡片，轮播不会自动播放。</p>
                    </div>
                    <fieldset className="share-content-settings" disabled={shareActionBusy}>
                      <legend>卡片内容</legend>
                      <p
                        className={`share-content-settings__status${shareCardSettingsStatus === 'failed' ? ' is-failed' : ''}`}
                        aria-live="polite"
                      >
                        {formatShareCardSettingsStatus(shareCardSettingsStatus)}
                      </p>
                      <div className="share-content-settings__limit">
                        <span>网站数量</span>
                        <div className="share-site-limit" aria-label="卡片显示的网站数量">
                          {SHARE_CARD_SITE_LIMITS.map((limit) => (
                            <label key={limit}>
                              <input
                                type="radio"
                                name="share-card-site-limit"
                                value={limit}
                                checked={shareCardSettings.siteLimit === limit}
                                onChange={() => applyShareCardSettings({ ...shareCardSettings, siteLimit: limit })}
                              />
                              <span>{limit}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="share-content-toggle">
                        <span>
                          <strong>网站图标</strong>
                          <small>快速识别阅读来源</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={shareCardSettings.showSiteIcons}
                          onChange={(event) => applyShareCardSettings({
                            ...shareCardSettings,
                            showSiteIcons: event.target.checked,
                          })}
                        />
                      </label>
                      <label className="share-content-toggle">
                        <span>
                          <strong>连续天数</strong>
                          <small>显示本次连续打卡</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={shareCardSettings.showStreak}
                          onChange={(event) => applyShareCardSettings({
                            ...shareCardSettings,
                            showStreak: event.target.checked,
                          })}
                        />
                      </label>
                    </fieldset>
                    <ActionButton
                      icon={Clipboard}
                      disabled={shareActionBusy}
                      aria-busy={copyStatus === 'copying'}
                      onClick={() => void copyShareCard()}
                    >
                      {copyStatus === 'copying' ? '复制中...' : copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '复制失败' : '复制文案'}
                    </ActionButton>
                    <ActionButton
                      icon={Download}
                      disabled={shareActionBusy}
                      aria-busy={downloadStatus === 'downloading'}
                      onClick={() => void downloadShareCard()}
                    >
                      {downloadStatus === 'downloading' ? '导出中...' : downloadStatus === 'downloaded' ? '已下载' : downloadStatus === 'failed' ? '导出失败' : '下载 PNG'}
                    </ActionButton>
                    {copyStatus === 'copied' ? <InlineNotice tone="positive">文案已复制。</InlineNotice> : null}
                    {downloadStatus === 'downloaded' ? <InlineNotice tone="positive">PNG 已下载。</InlineNotice> : null}
                    {copyStatus === 'failed' || downloadStatus === 'failed'
                      ? <InlineNotice tone="danger">卡片操作失败，请重试。</InlineNotice>
                      : null}
                  </aside>
                </div>
              </section>
            ) : null}

            <ReadingInsights dailyGoal={checkInThresholdWords} history={insightHistory} />
          </>
        ) : null}

        <section id="reading-profile" className="dashboard-panel reading-profile" aria-labelledby="reading-profile-title">
          <SectionHeader icon={Gauge} meta={readingPaceValue}>
            <span id="reading-profile-title" tabIndex={-1}>阅读档案</span>
          </SectionHeader>

          <div className="check-in-setting">
            <div className="check-in-setting__copy">
              <h3>每日打卡目标</h3>
              <p>当天达到目标后才计入连续打卡；修改后会按新目标重算历史记录。</p>
            </div>
            {checkInGoalEditing ? (
              <form className="check-in-setting__form" noValidate onSubmit={(event) => void persistCheckInGoal(event)}>
                <label htmlFor="daily-check-in-threshold">有效阅读词数</label>
                <div className="check-in-setting__input-row">
                  <div className="check-in-setting__input">
                    <input
                      ref={checkInGoalInputRef}
                      id="daily-check-in-threshold"
                      type="number"
                      inputMode="numeric"
                      min={MIN_DAILY_CHECK_IN_THRESHOLD_WORDS}
                      max={MAX_DAILY_CHECK_IN_THRESHOLD_WORDS}
                      step="1"
                      value={checkInGoalInput}
                      aria-describedby="daily-check-in-threshold-hint"
                      aria-invalid={checkInGoalSaveStatus === 'invalid'}
                      disabled={checkInGoalSaveStatus === 'saving'}
                      onChange={(event) => {
                        setCheckInGoalInput(event.target.value);
                        if (checkInGoalSaveStatus !== 'idle') setCheckInGoalSaveStatus('idle');
                      }}
                    />
                    <span>词 / 天</span>
                  </div>
                  <div className="check-in-setting__form-actions">
                    <ActionButton
                      type="button"
                      variant="quiet"
                      disabled={checkInGoalSaveStatus === 'saving'}
                      onClick={cancelCheckInGoalEditor}
                    >
                      取消
                    </ActionButton>
                    <ActionButton
                      type="submit"
                      variant="primary"
                      disabled={checkInGoalSaveStatus === 'saving'}
                      aria-busy={checkInGoalSaveStatus === 'saving'}
                    >
                      {checkInGoalSaveStatus === 'saving' ? '保存中...' : '保存目标'}
                    </ActionButton>
                  </div>
                </div>
                <p id="daily-check-in-threshold-hint">
                  可设置 {formatCount(MIN_DAILY_CHECK_IN_THRESHOLD_WORDS)}–{formatCount(MAX_DAILY_CHECK_IN_THRESHOLD_WORDS)} 个有效词。
                </p>
                {checkInGoalSaveStatus === 'invalid' ? (
                  <InlineNotice tone="danger">请输入范围内的整数词数。</InlineNotice>
                ) : null}
                {checkInGoalSaveStatus === 'failed' ? (
                  <InlineNotice tone="danger">目标保存失败，原设置未改变。</InlineNotice>
                ) : null}
              </form>
            ) : (
              <div className="check-in-setting__value">
                <strong>{formatCount(checkInThresholdWords)} <span>词 / 天</span></strong>
                <ActionButton
                  id="check-in-goal-trigger"
                  type="button"
                  icon={SlidersHorizontal}
                  disabled={clearBusy || calibrationSaveStatus === 'saving'}
                  onClick={openCheckInGoalEditor}
                >
                  调整目标
                </ActionButton>
              </div>
            )}
          </div>
          {checkInGoalSaveStatus === 'saved' ? (
            <InlineNotice tone="positive">打卡目标已保存，连续记录已重新计算。</InlineNotice>
          ) : null}

          {calibrationStep === 'idle' ? (
            <div className="reading-profile__summary">
              <p>{readingPaceLabel}</p>
              <ActionButton id="pace-calibration-trigger" icon={Play} onClick={startPaceCalibration}>
                {paceSummary?.hasProfile ? '重新校准' : '开始校准'}
              </ActionButton>
            </div>
          ) : null}

          {calibrationStep === 'reading' ? (
            <div id="pace-calibration" className="calibration-flow">
              <div className="calibration-flow__heading">
                <div>
                  <p className="dashboard-kicker">速度校准 · {PACE_CALIBRATION_WORD_COUNT} 词</p>
                  <h3 id="pace-calibration-reading-title" tabIndex={-1}>按平常速度阅读</h3>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="取消校准"
                  disabled={calibrationSaveStatus === 'saving'}
                  onClick={cancelPaceCalibration}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <article className="calibration-passage" lang="en">{PACE_CALIBRATION_PASSAGE}</article>
              <ActionButton variant="primary" icon={CheckCircle2} onClick={finishPaceReading}>我已读完</ActionButton>
            </div>
          ) : null}

          {calibrationStep === 'questions' ? (
            <div id="pace-calibration" className="calibration-flow">
              <div className="calibration-flow__heading">
                <div lang="en">
                  <p className="dashboard-kicker">Comprehension check</p>
                  <h3 id="pace-calibration-questions-title" tabIndex={-1}>Answer three questions</h3>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="取消校准"
                  disabled={calibrationSaveStatus === 'saving'}
                  onClick={cancelPaceCalibration}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className="calibration-questions" lang="en">
                {paceCalibrationQuestions.map((question, index) => (
                  <fieldset key={question.id} disabled={calibrationSaveStatus === 'saving'}>
                    <legend><span>{index + 1}</span>{question.prompt}</legend>
                    <div className="calibration-options">
                      {question.options.map((option) => {
                        const selected = calibrationAnswers[question.id] === option.id;
                        return (
                          <label key={option.id} className={selected ? 'is-selected' : ''}>
                            <input
                              type="radio"
                              name={`calibration-${question.id}`}
                              value={option.id}
                              checked={selected}
                              onChange={() => setCalibrationAnswers((answers) => ({ ...answers, [question.id]: option.id }))}
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="calibration-flow__actions">
                <ActionButton
                  variant="quiet"
                  disabled={calibrationSaveStatus === 'saving'}
                  onClick={cancelPaceCalibration}
                >
                  取消
                </ActionButton>
                <ActionButton
                  variant="primary"
                  icon={CheckCircle2}
                  disabled={!allCalibrationQuestionsAnswered || calibrationSaveStatus === 'saving'}
                  aria-busy={calibrationSaveStatus === 'saving'}
                  onClick={() => void savePaceCalibrationResult()}
                >
                  {calibrationSaveStatus === 'saving' ? '保存中...' : '保存校准'}
                </ActionButton>
              </div>
              {calibrationSaveStatus === 'failed' ? <InlineNotice tone="danger">校准保存失败。</InlineNotice> : null}
            </div>
          ) : null}

          {calibrationSaveStatus === 'saved' ? <InlineNotice tone="positive">校准已保存。</InlineNotice> : null}
          {calibrationSaveStatus === 'rejected' ? (
            <InlineNotice tone="neutral">理解题未达门槛，本次速度样本未写入。</InlineNotice>
          ) : null}
        </section>

        {viewState === 'ready' && details ? (
          <>
            <div className="dashboard-grid">
              <Panel title="近期阅读量" meta={`${details.recentPages.length} 个页面`} icon={BookOpen}>
                <div className="record-list">
                  {details.recentPages.length
                    ? details.recentPages.map((page) => (
                        <RecentPageCard
                          key={page.pageId}
                          page={page}
                          resolveFaviconUrl={dependencies.getWebsiteFaviconUrl}
                        />
                      ))
                    : <EmptyState>还没有阅读记录。</EmptyState>}
                </div>
              </Panel>

              <Panel title="词汇" meta={`${details.recentVocabulary.length} 个`} icon={Languages}>
                <div className="record-list">
                  {details.recentVocabulary.length
                    ? details.recentVocabulary.map((vocab) => <VocabularyCard key={vocab.lemma} vocab={vocab} />)
                    : <EmptyState>还没有词汇记录。</EmptyState>}
                </div>
              </Panel>
            </div>

            <Panel title="保存摘录" meta={`${details.recentSavedItems.length} 条`} icon={Quote}>
              <div className="saved-grid">
                {details.recentSavedItems.length
                  ? details.recentSavedItems.map((item) => <SavedHighlightCard key={item.id} item={item} />)
                  : <EmptyState>还没有保存摘录。</EmptyState>}
              </div>
            </Panel>
          </>
        ) : null}

        <section id="local-data" className="local-data" aria-labelledby="local-data-title">
          <div>
            <div className="local-data__title">
              <LockKeyhole aria-hidden="true" />
              <h2 id="local-data-title" tabIndex={-1}>本地数据</h2>
            </div>
            <p>清除阅读、词汇、摘录和速度档案；网站权限不变。</p>
          </div>
          <ActionButton
            variant="danger"
            disabled={clearBusy || calibrationSaveStatus === 'saving' || checkInGoalSaveStatus === 'saving'}
            aria-busy={clearBusy}
            onClick={() => void clearData()}
          >
            {clearBusy ? '清空中...' : '清空本地数据'}
          </ActionButton>
        </section>
      </div>
    </main>
  );
}

function DashboardLoading() {
  return (
    <section className="dashboard-loading" aria-hidden="true">
      <div className="dashboard-loading__line" />
      <div className="dashboard-loading__metric" />
      <div className="dashboard-loading__grid">
        <div />
        <div />
        <div />
      </div>
    </section>
  );
}

function Panel({
  title,
  meta,
  icon,
  children,
}: {
  title: string;
  meta: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="dashboard-panel">
      <SectionHeader icon={icon} meta={meta}>{title}</SectionHeader>
      {children}
    </section>
  );
}

function RecentPageCard({
  page,
  resolveFaviconUrl,
}: {
  page: RecentPageSummary;
  resolveFaviconUrl: (domain: string) => string | undefined;
}) {
  return (
    <article className="record-row">
      <div className="record-row__heading">
        <div className="record-row__identity">
          <SiteFavicon domain={page.domain} resolveUrl={resolveFaviconUrl} />
          <h3 title={page.domain}>{page.domain}</h3>
        </div>
        <time dateTime={new Date(page.lastReadAt).toISOString()}>{formatDateTime(page.lastReadAt)}</time>
      </div>
      <p>
        累计有效 {formatCount(page.effectiveWords)} 词 · 内容覆盖 {formatCount(page.coveredWords)} / {formatCount(page.totalWords)} 词
      </p>
      {page.totalWords > 0 ? (
        <ProgressBar
          label={`${page.domain} 内容覆盖`}
          value={page.coveredWords}
          max={page.totalWords}
          valueText={`${formatCount(page.coveredWords)} / ${formatCount(page.totalWords)} 词`}
        />
      ) : null}
    </article>
  );
}

function VocabularyCard({ vocab }: { vocab: RecentVocabularySummary }) {
  return (
    <article className="record-row">
      <div className="record-row__heading">
        <h3 title={vocab.lemma}>{vocab.lemma}</h3>
        <span className={`vocabulary-status vocabulary-status--${vocab.userStatus}`}>{formatVocabularyStatus(vocab.userStatus)}</span>
      </div>
      <p>有效出现 {formatCount(vocab.effectiveSeenCount)} 次{vocab.savedCount > 0 ? ` · 已收藏 ${vocab.savedCount}` : ''}</p>
      {vocab.packTags.length > 0 ? (
        <div className="tag-list" aria-label="词汇标签">
          {vocab.packTags.map((tag) => <span key={tag} title={tag}>{tag}</span>)}
        </div>
      ) : null}
    </article>
  );
}

function SavedHighlightCard({ item }: { item: RecentSavedItemSummary }) {
  return (
    <article className="saved-item">
      <div className="saved-item__meta">
        <span>{formatSavedItemType(item.type)}</span>
        <time dateTime={new Date(item.createdAt).toISOString()}>{formatDateTime(item.createdAt)}</time>
      </div>
      <blockquote>“{item.text}”</blockquote>
      <footer>
        <span title={item.sourceDomain}>{item.sourceDomain}</span>
        {item.tags.map((tag) => <span key={tag} title={tag}>{tag}</span>)}
      </footer>
    </article>
  );
}

const PACE_CALIBRATION_PASSAGE =
  'Many people read technical pages in short sessions, switching between notes, examples, and browser tabs. A useful reading estimate should not treat every visible paragraph as fully read at the same time. It should start with one realistic pace for the reader, then divide that attention across the text that is actually visible. When the tab is hidden, the page is idle, or the reader scrolls too quickly, the estimate should become cautious. When the reader stays with a stable viewport and several body paragraphs remain visible, the sample becomes more useful. Yuel uses this calibration passage to set an initial baseline for your personal reading pace. The result is not a grade. It is a local starting point that can improve later as real pages provide stronger evidence. Comprehension questions help decide how much weight to give the timing measurement. If the answers are solid, the observed pace can influence the baseline more. If the answers are weak, the timing sample is discarded and the system waits for future high confidence evidence. Over time, adaptive updates should move slowly, so one unusual page does not suddenly rewrite the baseline. This keeps daily word counts practical without rewarding fast skimming or accidental exposure.';

const PACE_CALIBRATION_WORD_COUNT = analyzeEnglishText(PACE_CALIBRATION_PASSAGE).wordCount;

const paceCalibrationQuestions = [
  {
    id: 'budget',
    prompt: 'What should a useful reading estimate avoid?',
    correctOptionId: 'duplicate',
    options: [
      { id: 'duplicate', label: 'Duplicating visible paragraphs' },
      { id: 'notes', label: 'Using browser notes' },
      { id: 'local', label: 'Keeping data local' },
    ],
  },
  {
    id: 'confidence',
    prompt: 'When should timing receive more calibration weight?',
    correctOptionId: 'solid',
    options: [
      { id: 'solid', label: 'When answers are solid' },
      { id: 'hidden', label: 'When the tab is hidden' },
      { id: 'fast', label: 'When scrolling is fast' },
    ],
  },
  {
    id: 'adaptive',
    prompt: 'What improves the baseline after onboarding?',
    correctOptionId: 'samples',
    options: [
      { id: 'samples', label: 'High confidence real-page samples' },
      { id: 'skimming', label: 'Fast skimming exposure' },
      { id: 'opening', label: 'Opening unread pages' },
    ],
  },
];

function scrollToSection(root: HTMLElement | null, id: string) {
  const target = root?.querySelector<HTMLElement>(`#${id}`);
  if (!target) return;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  const focusTarget = target.querySelector<HTMLElement>('[tabindex="-1"]')
    ?? target.querySelector<HTMLElement>('h1, h2, h3');
  focusTarget?.focus({ preventScroll: true });
}

function formatPaceSource(summary: ReadingPaceSummary): string {
  if (summary.source === 'default') return '默认速度，等待校准或可靠样本。';
  if (summary.source === 'onboarding') {
    return summary.updatedAt ? `${formatDateTime(summary.updatedAt)} 完成校准` : '已完成初始校准';
  }
  return `${summary.sampleCount} 个可靠样本正在缓慢调整速度`;
}

function formatShareCardSettingsStatus(
  status: 'idle' | 'loading' | 'saving' | 'saved' | 'failed',
): string {
  if (status === 'loading') return '正在读取偏好';
  if (status === 'saving') return '正在自动保存';
  if (status === 'failed') return '设置仅对本次有效';
  if (status === 'saved') return '已自动保存到本地';
  return '调整会自动保存';
}

function formatSavedItemType(type: RecentSavedItemSummary['type']): string {
  if (type === 'word') return '单词';
  if (type === 'phrase') return '短语';
  return '摘录';
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
  await navigator.clipboard.writeText(text);
}

async function exportDashboardSummaryCardPng(element: HTMLElement, filename: string): Promise<void> {
  await exportSummaryCardImage(element, { filename });
}
