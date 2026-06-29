import {
  Activity,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  Gauge,
  Languages,
  LockKeyhole,
  Play,
  Settings,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';

import { DEFAULT_BASE_WORDS_PER_MINUTE } from '../../src/domain/metrics';
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
import { exportSummaryCardPng as exportSummaryCardImage } from '../../src/ui/shareCardImage';

export interface DashboardAppDependencies {
  getReadingDashboardDetails: typeof getReadingDashboardDetails;
  clearLocalReadingData: typeof clearLocalReadingData;
  confirmClearLocalReadingData: () => boolean;
  copyTextToClipboard?: (text: string) => Promise<void>;
  exportSummaryCardPng?: (element: HTMLElement, filename: string) => Promise<unknown>;
  getReadingPaceSummary?: typeof getReadingPaceSummary;
  saveOnboardingReadingPaceCalibration?: typeof saveOnboardingReadingPaceCalibration;
}

const defaultDependencies: DashboardAppDependencies = {
  clearLocalReadingData,
  confirmClearLocalReadingData: () =>
    window.confirm('清空所有阅量本地阅读数据？已启用网站和浏览器权限会保留。'),
  copyTextToClipboard,
  exportSummaryCardPng: exportDashboardSummaryCardPng,
  getReadingDashboardDetails,
  getReadingPaceSummary,
  saveOnboardingReadingPaceCalibration,
};

export function DashboardApp({ dependencies = defaultDependencies }: { dependencies?: DashboardAppDependencies }) {
  const [details, setDetails] = useState<ReadingDashboardDetails>();
  const [paceSummary, setPaceSummary] = useState<ReadingPaceSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [paceLoadFailed, setPaceLoadFailed] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const [clearRefreshFailed, setClearRefreshFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloaded' | 'failed'>('idle');
  const [calibrationStep, setCalibrationStep] = useState<'idle' | 'reading' | 'questions'>('idle');
  const [calibrationStartedAt, setCalibrationStartedAt] = useState<number>();
  const [calibrationAnswers, setCalibrationAnswers] = useState<Record<string, string>>({});
  const [calibrationSaveStatus, setCalibrationSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const shareCardRef = useRef<HTMLDivElement>(null);
  const loadPaceSummary = dependencies.getReadingPaceSummary ?? getFallbackReadingPaceSummary;
  const savePaceCalibration = dependencies.saveOnboardingReadingPaceCalibration ?? saveOnboardingReadingPaceCalibration;

  useEffect(() => {
    let mounted = true;

    void dependencies.getReadingDashboardDetails()
      .then((nextDetails) => {
        if (!mounted) return;
        setDetails(nextDetails);
      })
      .catch((error) => {
        console.error('Failed to load Yuel dashboard details', error);
        if (!mounted) return;
        setLoadFailed(true);
      });

    void loadPaceSummary()
      .then((nextPaceSummary) => {
        if (!mounted) return;
        setPaceSummary(nextPaceSummary);
      })
      .catch((error) => {
        console.error('Failed to load Yuel reading pace summary', error);
        if (!mounted) return;
        setPaceLoadFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [dependencies, loadPaceSummary]);

  const summary = details?.summary;
  const statusText = loadFailed ? '本地数据不可用' : details?.hasData ? '本地数据已读取' : details ? '还没有阅读数据' : '正在读取本地数据...';
  const effectiveWordsValue = loadFailed ? '不可用' : summary ? formatCount(summary.effectiveWords) : '...';
  const readingTimeValue = loadFailed ? '不可用' : summary ? formatMinutes(summary.minutes) : '...';
  const pagesTodayValue = loadFailed ? '不可用' : summary ? String(summary.readPages) : '...';
  const learningWordsValue = loadFailed ? '不可用' : summary ? String(summary.learningWords) : '...';
  const shareCardText = loadFailed ? '本地数据不可用' : details?.summaryCardText ?? '正在读取本地数据';
  const detailPanelFallbackText = loadFailed ? '本地数据不可用。' : '正在读取本地数据...';
  const readingPaceValue = paceLoadFailed ? '不可用' : paceSummary ? `${Math.round(paceSummary.baseWordsPerMinute)} WPM` : '...';
  const readingPaceLabel = paceLoadFailed ? '阅读速度不可用' : paceSummary ? formatPaceSource(paceSummary) : '正在读取阅读速度';
  const copyCardText = dependencies.copyTextToClipboard ?? copyTextToClipboard;
  const exportCardPng = dependencies.exportSummaryCardPng ?? exportDashboardSummaryCardPng;
  const allCalibrationQuestionsAnswered = paceCalibrationQuestions.every((question) => calibrationAnswers[question.id]);
  const topDomain = summary?.topDomains[0] ?? '暂无常读网站';

  const clearData = async () => {
    if (!dependencies.confirmClearLocalReadingData()) {
      return;
    }

    setClearBusy(true);
    setClearFailed(false);
    setClearRefreshFailed(false);
    setLoadFailed(false);
    setPaceLoadFailed(false);
    setCopyStatus('idle');
    setDownloadStatus('idle');
    setCalibrationStep('idle');
    setCalibrationAnswers({});
    setCalibrationSaveStatus('idle');

    try {
      await dependencies.clearLocalReadingData();
    } catch (error) {
      console.error('Failed to clear Yuel local data', error);
      setClearFailed(true);
      setClearBusy(false);
      return;
    }

    setDetails(undefined);
    setPaceSummary(undefined);

    try {
      setDetails(await dependencies.getReadingDashboardDetails());
    } catch (error) {
      console.error('Failed to refresh Yuel dashboard details after clearing local data', error);
      setLoadFailed(true);
      setClearRefreshFailed(true);
    } finally {
      setClearBusy(false);
    }

    try {
      setPaceSummary(await loadPaceSummary());
    } catch (error) {
      console.error('Failed to refresh Yuel reading pace after clearing local data', error);
      setPaceLoadFailed(true);
    }
  };

  const copyShareCard = async () => {
    if (!details) {
      return;
    }

    setCopyStatus('idle');

    try {
      await copyCardText(details.summaryCardText);
      setCopyStatus('copied');
    } catch (error) {
      console.error('Failed to copy Yuel share card text', error);
      setCopyStatus('failed');
    }
  };

  const downloadShareCard = async () => {
    if (!details || !shareCardRef.current) {
      return;
    }

    setDownloadStatus('idle');

    try {
      await exportCardPng(shareCardRef.current, `yuel-reading-${details.summary.date}.png`);
      setDownloadStatus('downloaded');
    } catch (error) {
      console.error('Failed to export Yuel share card PNG', error);
      setDownloadStatus('failed');
    }
  };

  const startPaceCalibration = () => {
    setCalibrationStartedAt(Date.now());
    setCalibrationAnswers({});
    setCalibrationStep('reading');
    setCalibrationSaveStatus('idle');
  };

  const finishPaceReading = () => {
    if (!calibrationStartedAt) {
      return;
    }

    setCalibrationStep('questions');
  };

  const savePaceCalibrationResult = async () => {
    if (!calibrationStartedAt || !allCalibrationQuestionsAnswered) {
      return;
    }

    const correctAnswers = paceCalibrationQuestions.filter((question) => calibrationAnswers[question.id] === question.correctOptionId).length;
    setCalibrationSaveStatus('saving');

    try {
      const nextPaceSummary = await savePaceCalibration({
        language: 'en',
        contentType: 'general',
        wordCount: PACE_CALIBRATION_WORD_COUNT,
        startedAt: calibrationStartedAt,
        completedAt: Date.now(),
        correctAnswers,
        questionCount: paceCalibrationQuestions.length,
      });
      setPaceSummary(nextPaceSummary);
      setCalibrationStep('idle');
      setCalibrationSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save Yuel reading pace calibration', error);
      setCalibrationSaveStatus('failed');
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F5EF] text-[#111827]">
      <header className="border-b border-[#E5E7EB] bg-[#F7F5EF]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2F9B74]">阅量 Yuel</p>
            <h1 className="mt-2 text-4xl font-bold">阅读输入仪表盘</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#6B7280]">
              记录你在真实网页中的外语阅读输入、词汇暴露和摘录积累。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#DDE7DF] bg-white px-3 py-2 text-sm font-semibold text-[#1F7A5B]">{statusText}</span>
            <button
              type="button"
              onClick={() => document.getElementById('local-data')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex items-center gap-2 rounded-[12px] border border-[#D7DDD8] bg-white px-3 py-2 text-sm font-bold text-[#111827]"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              设置
            </button>
          </div>
          {clearFailed ? <p className="text-sm font-medium text-red-700">清空失败，本地数据未改变。</p> : null}
          {clearRefreshFailed ? <p className="text-sm font-medium text-red-700">本地数据已清空，但仪表盘刷新失败。</p> : null}
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 py-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-[24px] bg-[#101827] p-6 text-white shadow-[0_22px_50px_rgba(16,24,39,0.22)]">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold text-[#D8B46A]">今日有效阅读</p>
              <p className="mt-3 font-mono text-6xl font-bold tabular-nums">{effectiveWordsValue}</p>
              <p className="mt-2 text-sm font-semibold text-slate-300">words</p>
            </div>
            <button
              type="button"
              onClick={() => document.getElementById('share-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#2F9B74] px-4 py-3 text-sm font-bold text-white shadow-[0_10px_22px_rgba(47,155,116,0.32)] hover:bg-[#1F7A5B]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              生成今日卡片
            </button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <HeroChip label="阅读时间" value={readingTimeValue} icon={Activity} />
            <HeroChip label="今日页面" value={pagesTodayValue} icon={Database} />
            <HeroChip label="学习中词汇" value={learningWordsValue} icon={Languages} />
            <HeroChip label="连续打卡" value={summary ? `${summary.streak} days` : '...'} icon={BookOpenCheck} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
            <span className="rounded-full border border-white/10 px-3 py-1.5">{topDomain}</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">High confidence</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">local-first</span>
          </div>
        </section>

        <section id="share-card" className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-[0_18px_40px_rgba(16,24,39,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">今日卡片预览</h2>
              <p className="mt-1 text-sm text-[#6B7280]">把今天的阅读输入变成可分享资产。</p>
            </div>
            <Sparkles className="h-5 w-5 text-[#D8B46A]" aria-hidden="true" />
          </div>
          <ShareCardPreview
            ref={shareCardRef}
            date={summary?.date ?? '...'}
            effectiveWords={effectiveWordsValue}
            readingTime={readingTimeValue}
            learningWords={learningWordsValue}
            topDomain={topDomain}
            fallbackText={shareCardText}
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!details}
              onClick={() => void copyShareCard()}
              className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#D7DDD8] bg-white px-3 py-2 text-sm font-bold text-[#111827] hover:border-[#2F9B74] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Clipboard className="h-4 w-4" aria-hidden="true" />
              {copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '复制失败' : '复制文案'}
            </button>
            <button
              type="button"
              disabled={!details}
              onClick={() => void downloadShareCard()}
              className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#D7DDD8] bg-white px-3 py-2 text-sm font-bold text-[#111827] hover:border-[#2F9B74] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {downloadStatus === 'downloaded' ? '已下载' : downloadStatus === 'failed' ? '导出失败' : '下载 PNG'}
            </button>
          </div>
        </section>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="阅读趋势" meta={details ? `${details.recentPages.length} pages` : '...'} icon={TrendingUp}>
          <ReadingTrend pages={details?.recentPages ?? []} fallbackText={detailPanelFallbackText} hasDetails={Boolean(details)} />
        </Panel>

        <Panel title="阅读速度" meta={readingPaceValue} icon={Gauge}>
          <p className="text-sm leading-6 text-[#6B7280]">{readingPaceLabel}</p>
          <button
            type="button"
            onClick={startPaceCalibration}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#D7DDD8] bg-white px-3 py-2 text-sm font-bold text-[#111827] hover:border-[#2F9B74]"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            开始校准
          </button>

          {calibrationStep === 'reading' ? (
            <div className="mt-5 border-t border-[#E5E7EB] pt-5">
              <p className="text-sm font-bold text-[#111827]">{PACE_CALIBRATION_WORD_COUNT} words</p>
              <p className="mt-3 text-sm leading-7 text-[#374151]">{PACE_CALIBRATION_PASSAGE}</p>
              <button
                type="button"
                onClick={finishPaceReading}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-[12px] bg-[#2F9B74] px-3 py-2 text-sm font-bold text-white hover:bg-[#1F7A5B]"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                我已读完
              </button>
            </div>
          ) : null}

          {calibrationStep === 'questions' ? (
            <div className="mt-5 border-t border-[#E5E7EB] pt-5">
              <div className="grid gap-4">
                {paceCalibrationQuestions.map((question) => (
                  <fieldset key={question.id}>
                    <legend className="text-sm font-bold text-[#111827]">{question.prompt}</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.options.map((option) => {
                        const selected = calibrationAnswers[question.id] === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setCalibrationAnswers((answers) => ({ ...answers, [question.id]: option.id }))}
                            className={`rounded-[10px] border px-3 py-2 text-sm font-semibold ${
                              selected
                                ? 'border-[#2F9B74] bg-[#F1F5F0] text-[#1F7A5B]'
                                : 'border-[#D7DDD8] text-[#374151] hover:border-[#2F9B74]'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  disabled={!allCalibrationQuestionsAnswered || calibrationSaveStatus === 'saving'}
                  onClick={() => void savePaceCalibrationResult()}
                  className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[#2F9B74] px-3 py-2 text-sm font-bold text-white hover:bg-[#1F7A5B] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {calibrationSaveStatus === 'saving' ? '保存中...' : '保存校准'}
                </button>
                {calibrationSaveStatus === 'failed' ? <p className="text-sm font-medium text-red-700">校准保存失败。</p> : null}
              </div>
            </div>
          ) : null}

          {calibrationSaveStatus === 'saved' ? (
            <p className="mt-4 text-sm font-medium text-[#1F7A5B]">校准已保存。</p>
          ) : null}
        </Panel>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Panel title="最近阅读" meta={details ? `${details.recentPages.length} tracked` : '...'} icon={BookOpen}>
          <div className="grid gap-3">
            {!details ? (
              <EmptyPanel text={detailPanelFallbackText} />
            ) : details.recentPages.length ? (
              details.recentPages.map((page) => <RecentPageCard key={page.pageId} page={page} />)
            ) : (
              <EmptyPanel text="还没有阅读记录。" />
            )}
          </div>
        </Panel>

        <Panel title="词汇资产" meta={details ? `${details.recentVocabulary.length} terms` : '...'} icon={Languages}>
          <div className="mb-4 flex flex-wrap gap-2">
            {['All', 'New', 'Learning', 'Saved'].map((item) => (
              <span key={item} className="rounded-full border border-[#DDE7DF] bg-[#F1F5F0] px-3 py-1 text-xs font-bold text-[#1F7A5B]">
                {item}
              </span>
            ))}
          </div>
          <div className="grid gap-3">
            {!details ? (
              <EmptyPanel text={detailPanelFallbackText} />
            ) : details.recentVocabulary.length ? (
              details.recentVocabulary.map((vocab) => <VocabularyCard key={vocab.lemma} vocab={vocab} />)
            ) : (
              <EmptyPanel text="还没有词汇暴露记录。" />
            )}
          </div>
        </Panel>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="保存摘录" meta={details ? `${details.recentSavedItems.length} saved` : '...'} icon={Sparkles}>
          <div className="grid gap-3">
            {!details ? (
              <EmptyPanel text={detailPanelFallbackText} />
            ) : details.recentSavedItems.length ? (
              details.recentSavedItems.map((item) => <SavedHighlightCard key={item.id} item={item} />)
            ) : (
              <EmptyPanel text="还没有保存摘录。" />
            )}
          </div>
        </Panel>

        <section id="local-data" className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-[0_18px_40px_rgba(16,24,39,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">本地数据</h2>
              <p className="mt-2 text-sm leading-6 text-[#6B7280]">清空只影响本地阅读数据库，已启用网站和浏览器权限会保留。</p>
            </div>
            <LockKeyhole className="h-5 w-5 text-[#D8B46A]" aria-hidden="true" />
          </div>
          <button
            type="button"
            disabled={clearBusy}
            onClick={() => void clearData()}
            className="mt-5 inline-flex items-center justify-center rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {clearBusy ? '清空中...' : '清空本地数据'}
          </button>
        </section>
      </section>
    </main>
  );
}

function Panel({
  title,
  meta,
  icon: Icon,
  children,
}: {
  title: string;
  meta: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-[0_18px_40px_rgba(16,24,39,0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-[#2F9B74]" aria-hidden="true" />
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        <span className="text-sm font-semibold text-[#6B7280]">{meta}</span>
      </div>
      {children}
    </section>
  );
}

function HeroChip({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-white/8 p-3">
      <Icon className="h-4 w-4 text-[#BCE9D8]" aria-hidden="true" />
      <p className="mt-2 text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-base font-bold tabular-nums text-white">{value}</p>
    </div>
  );
}

const ShareCardPreview = ({
  ref,
  date,
  effectiveWords,
  readingTime,
  learningWords,
  topDomain,
  fallbackText,
}: {
  ref: Ref<HTMLDivElement>;
  date: string;
  effectiveWords: string;
  readingTime: string;
  learningWords: string;
  topDomain: string;
  fallbackText: string;
}) => (
  <div ref={ref} className="mt-4 overflow-hidden rounded-[22px] bg-[#101827] p-5 text-white">
    <div className="flex items-center justify-between text-xs font-bold text-[#D8B46A]">
      <span>今日英文阅读</span>
      <span>{date}</span>
    </div>
    <p className="mt-6 font-mono text-5xl font-bold tabular-nums">{effectiveWords}</p>
    <p className="mt-2 text-sm font-semibold text-slate-300">words</p>
    <div className="mt-6 grid grid-cols-2 gap-3">
      <div className="rounded-[14px] border border-white/10 bg-white/8 p-3">
        <p className="text-xs text-slate-400">阅读时间</p>
        <p className="mt-1 font-mono text-lg font-bold tabular-nums">{readingTime}</p>
      </div>
      <div className="rounded-[14px] border border-white/10 bg-white/8 p-3">
        <p className="text-xs text-slate-400">学习中词汇</p>
        <p className="mt-1 font-mono text-lg font-bold tabular-nums">{learningWords}</p>
      </div>
    </div>
    <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-300">
      <span className="truncate">{topDomain}</span>
      <span className="font-bold text-[#BCE9D8]">Yuel 阅量</span>
    </div>
    <pre className="sr-only">{fallbackText}</pre>
  </div>
);

function ReadingTrend({ pages, fallbackText, hasDetails }: { pages: RecentPageSummary[]; fallbackText: string; hasDetails: boolean }) {
  if (!hasDetails) {
    return <EmptyPanel text={fallbackText} />;
  }

  if (pages.length === 0) {
    return <EmptyPanel text="还没有足够的趋势数据。" />;
  }

  const maxWords = Math.max(...pages.map((page) => page.effectiveWords), 1);

  return (
    <div className="grid gap-3">
      {pages.slice(0, 5).map((page) => (
        <div key={page.pageId}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-[#6B7280]">
            <span className="truncate">{page.domain}</span>
            <span>{formatCount(page.effectiveWords)} words</span>
          </div>
          <div className="h-2 rounded-full bg-[#F1F5F0]">
            <div className="h-full rounded-full bg-[#2F9B74]" style={{ width: `${Math.max(8, Math.round((page.effectiveWords / maxWords) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentPageCard({ page }: { page: RecentPageSummary }) {
  const progress = page.totalWords > 0 ? Math.min(100, Math.round((page.effectiveWords / page.totalWords) * 100)) : 0;

  return (
    <article className="rounded-[18px] border border-[#E5E7EB] bg-[#F8FAF7] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-bold">{page.domain}</h3>
        <span className="text-xs font-semibold text-[#6B7280]">{formatDateTime(page.lastReadAt)}</span>
      </div>
      <p className="mt-2 text-sm text-[#6B7280]">
        {formatCount(page.effectiveWords)} / {formatCount(page.totalWords)} words
      </p>
      <div className="mt-3 h-2 rounded-full bg-white">
        <div className="h-full rounded-full bg-[#2F9B74]" style={{ width: `${progress}%` }} />
      </div>
    </article>
  );
}

function VocabularyCard({ vocab }: { vocab: RecentVocabularySummary }) {
  return (
    <article className="rounded-[18px] border border-[#E5E7EB] bg-[#F8FAF7] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-bold">{vocab.lemma}</h3>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${formatVocabularyStatusClass(vocab.userStatus)}`}>
          {vocab.userStatus}
        </span>
      </div>
      <p className="mt-2 text-sm text-[#6B7280]">
        {formatCount(vocab.effectiveSeenCount)} effective exposures{vocab.savedCount > 0 ? ` · Saved ${vocab.savedCount}` : ''}
      </p>
      {vocab.packTags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {vocab.packTags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#DDE7DF] bg-white px-2.5 py-1 text-xs font-semibold text-[#1F7A5B]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SavedHighlightCard({ item }: { item: RecentSavedItemSummary }) {
  return (
    <article className="rounded-[18px] border border-[#E5E7EB] bg-[#F8FAF7] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase text-[#2F9B74]">{item.type}</span>
        <span className="text-xs text-[#6B7280]">{formatDateTime(item.createdAt)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#111827]">“{item.text}”</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#6B7280]">
        <span>{item.sourceDomain}</span>
        {item.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-[#D7DDD8] bg-white px-2 py-0.5">
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <p className="rounded-[18px] border border-dashed border-[#D7DDD8] bg-[#F8FAF7] p-4 text-sm text-[#6B7280]">
      {text}
    </p>
  );
}

const PACE_CALIBRATION_PASSAGE =
  'Many people read technical pages in short sessions, switching between notes, examples, and browser tabs. A useful reading estimate should not treat every visible paragraph as fully read at the same time. It should start with one realistic pace for the reader, then divide that attention across the text that is actually visible. When the tab is hidden, the page is idle, or the reader scrolls too quickly, the estimate should become cautious. When the reader stays with a stable viewport and several body paragraphs remain visible, the sample becomes more useful. Yuel uses this calibration passage to set an initial baseline for your personal reading pace. The result is not a grade. It is a local starting point that can improve later as real pages provide stronger evidence. Comprehension questions help decide how much weight to give the timing measurement. If the answers are solid, the observed pace can influence the baseline more. If the answers are weak, the system keeps more of the default pace and waits for future high confidence samples. Over time, adaptive updates should move slowly, so one unusual page does not suddenly rewrite the baseline. This keeps daily word counts practical without rewarding fast skimming or accidental exposure.';

const PACE_CALIBRATION_WORD_COUNT = countWords(PACE_CALIBRATION_PASSAGE);

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

function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function getFallbackReadingPaceSummary(): Promise<ReadingPaceSummary> {
  return {
    language: 'en',
    contentType: 'general',
    baseWordsPerMinute: DEFAULT_BASE_WORDS_PER_MINUTE,
    sampleCount: 0,
    source: 'default',
    hasProfile: false,
  };
}

function formatPaceSource(summary: ReadingPaceSummary): string {
  if (summary.source === 'default') {
    return '默认速度会在校准或高置信度阅读样本出现后更新。';
  }

  if (summary.source === 'onboarding') {
    return summary.updatedAt ? `已在 ${formatDateTime(summary.updatedAt)} 完成校准` : '已完成入门校准';
  }

  return `${summary.sampleCount} 个自适应样本`;
}

function formatMinutes(value: number): string {
  if (value < 1 && value > 0) {
    return '<1 min';
  }

  return `${Math.round(value)} min`;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatVocabularyStatusClass(status: RecentVocabularySummary['userStatus']): string {
  if (status === 'new') return 'bg-blue-50 text-[#3B82F6]';
  if (status === 'known') return 'bg-gray-100 text-[#6B7280]';
  return 'bg-[#F1F5F0] text-[#1F7A5B]';
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API unavailable');
  }

  await navigator.clipboard.writeText(text);
}

async function exportDashboardSummaryCardPng(element: HTMLElement, filename: string): Promise<void> {
  await exportSummaryCardImage(element, { filename });
}
