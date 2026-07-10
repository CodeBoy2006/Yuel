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

type DashboardViewState = 'loading' | 'error' | 'empty' | 'ready';
type CalibrationStep = 'idle' | 'reading' | 'questions';

export function DashboardApp({ dependencies = defaultDependencies }: { dependencies?: DashboardAppDependencies }) {
  const [details, setDetails] = useState<ReadingDashboardDetails>();
  const [paceSummary, setPaceSummary] = useState<ReadingPaceSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [paceLoadFailed, setPaceLoadFailed] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const [clearRefreshFailed, setClearRefreshFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloaded' | 'failed'>('idle');
  const [shareCardOpen, setShareCardOpen] = useState(() => window.location.hash === '#share-card');
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>('idle');
  const [calibrationStartedAt, setCalibrationStartedAt] = useState<number>();
  const [calibrationReadingFinishedAt, setCalibrationReadingFinishedAt] = useState<number>();
  const [calibrationAnswers, setCalibrationAnswers] = useState<Record<string, string>>({});
  const [calibrationSaveStatus, setCalibrationSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const shareCardRef = useRef<HTMLDivElement>(null);
  const calibrationSessionRef = useRef(0);
  const loadPaceSummary = dependencies.getReadingPaceSummary ?? getFallbackReadingPaceSummary;
  const savePaceCalibration = dependencies.saveOnboardingReadingPaceCalibration ?? saveOnboardingReadingPaceCalibration;

  useEffect(() => {
    let mounted = true;

    void dependencies.getReadingDashboardDetails()
      .then((nextDetails) => {
        if (!mounted) return;
        setDetails(nextDetails);
        setLoadFailed(false);
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
        setPaceLoadFailed(false);
      })
      .catch((error) => {
        console.error('Failed to load Yuel reading pace summary', error);
        if (!mounted) return;
        setPaceLoadFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [dependencies, loadPaceSummary, loadRequest]);

  useEffect(() => {
    if (window.location.hash !== '#share-card') return;
    setShareCardOpen(true);
  }, []);

  useEffect(() => {
    if (!shareCardOpen || !details?.hasData || window.location.hash !== '#share-card') return;
    window.requestAnimationFrame?.(() => {
      document.getElementById('share-card')?.scrollIntoView({ block: 'start' });
      document.getElementById('share-card-title')?.focus({ preventScroll: true });
    });
  }, [details?.hasData, shareCardOpen]);

  const summary = details?.summary;
  const viewState: DashboardViewState = loadFailed ? 'error' : !details ? 'loading' : details.hasData ? 'ready' : 'empty';
  const statusText = viewState === 'error'
    ? '本地数据不可用'
    : viewState === 'loading'
      ? '正在读取本地数据'
      : viewState === 'empty'
        ? '等待第一条记录'
        : '本地数据已读取';
  const statusTone = viewState === 'error' ? 'danger' : viewState === 'ready' ? 'positive' : 'neutral';
  const effectiveWordsValue = summary ? formatCount(summary.effectiveWords) : '—';
  const readingTimeValue = summary ? formatMinutes(summary.minutes) : '—';
  const pagesTodayValue = summary ? String(summary.readPages) : '—';
  const learningWordsValue = summary ? String(summary.learningWords) : '—';
  const shareCardText = details?.summaryCardText ?? '正在读取本地数据';
  const readingPaceValue = paceLoadFailed ? '不可用' : paceSummary ? `${Math.round(paceSummary.baseWordsPerMinute)} WPM` : '—';
  const readingPaceLabel = paceLoadFailed ? '阅读速度不可用' : paceSummary ? formatPaceSource(paceSummary) : '正在读取阅读速度';
  const copyCardText = dependencies.copyTextToClipboard ?? copyTextToClipboard;
  const exportCardPng = dependencies.exportSummaryCardPng ?? exportDashboardSummaryCardPng;
  const allCalibrationQuestionsAnswered = paceCalibrationQuestions.every((question) => calibrationAnswers[question.id]);
  const topDomain = summary?.topDomains[0] ?? '暂无常读网站';

  const retryLoading = () => {
    setDetails(undefined);
    setLoadFailed(false);
    setLoadRequest((request) => request + 1);
  };

  const clearData = async () => {
    if (!dependencies.confirmClearLocalReadingData()) return;

    setClearBusy(true);
    setClearFailed(false);
    setClearRefreshFailed(false);
    setLoadFailed(false);
    setPaceLoadFailed(false);
    setCopyStatus('idle');
    setDownloadStatus('idle');
    resetCalibration();

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
    if (viewState !== 'ready' || !details) return;
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
    if (viewState !== 'ready' || !details || !shareCardRef.current) return;
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
    calibrationSessionRef.current += 1;
    setCalibrationStartedAt(Date.now());
    setCalibrationReadingFinishedAt(undefined);
    setCalibrationAnswers({});
    setCalibrationStep('reading');
    setCalibrationSaveStatus('idle');
    window.requestAnimationFrame?.(() => document.getElementById('pace-calibration')?.scrollIntoView({ block: 'start' }));
  };

  function resetCalibration() {
    calibrationSessionRef.current += 1;
    setCalibrationStep('idle');
    setCalibrationStartedAt(undefined);
    setCalibrationReadingFinishedAt(undefined);
    setCalibrationAnswers({});
    setCalibrationSaveStatus('idle');
  }

  const finishPaceReading = () => {
    if (calibrationStartedAt === undefined) return;
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
    setCalibrationSaveStatus('saving');

    try {
      const nextPaceSummary = await savePaceCalibration({
        language: 'en',
        contentType: 'general',
        wordCount: PACE_CALIBRATION_WORD_COUNT,
        startedAt: calibrationStartedAt,
        completedAt: calibrationReadingFinishedAt,
        correctAnswers,
        questionCount: paceCalibrationQuestions.length,
      });
      if (sessionId !== calibrationSessionRef.current) return;
      setPaceSummary(nextPaceSummary);
      setCalibrationStep('idle');
      setCalibrationStartedAt(undefined);
      setCalibrationReadingFinishedAt(undefined);
      setCalibrationSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save Yuel reading pace calibration', error);
      if (sessionId !== calibrationSessionRef.current) return;
      setCalibrationSaveStatus('failed');
    }
  };

  return (
    <main className="yuel-app dashboard-app">
      <header className="dashboard-header">
        <div className="dashboard-header__inner">
          <BrandLockup />
          <nav className="dashboard-header__nav" aria-label="页面区段">
            <button type="button" onClick={() => scrollToSection('reading-profile')}>
              <Gauge aria-hidden="true" />
              阅读档案
            </button>
            <button type="button" onClick={() => scrollToSection('local-data')}>
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
            <ActionButton icon={Gauge} onClick={() => scrollToSection('reading-profile')}>先校准阅读速度</ActionButton>
          </section>
        ) : null}

        {viewState === 'ready' && details ? (
          <>
            <section className="today-ledger" aria-labelledby="today-reading-title">
              <div className="today-ledger__primary">
                <div>
                  <p className="dashboard-kicker">{summary?.date}</p>
                  <h2 id="today-reading-title">今日有效阅读</h2>
                </div>
                <p className="today-ledger__value"><strong>{effectiveWordsValue}</strong><span>词</span></p>
              </div>
              <div className="today-ledger__metrics">
                <Metric icon={Activity} label="阅读时间" value={readingTimeValue} />
                <Metric icon={Database} label="今日页面" value={pagesTodayValue} />
                <Metric icon={Languages} label="学习中词汇" value={learningWordsValue} />
                <Metric icon={BookOpen} label="连续记录" value={`${summary?.streak ?? 0} 天`} />
              </div>
              <div className="today-ledger__footer">
                <span className="today-ledger__domain" title={topDomain}>{topDomain}</span>
                <ActionButton
                  variant="quiet"
                  icon={Share2}
                  aria-expanded={shareCardOpen}
                  aria-controls="share-card"
                  onClick={() => setShareCardOpen((open) => !open)}
                >
                  {shareCardOpen ? '收起今日卡片' : '查看今日卡片'}
                </ActionButton>
              </div>
            </section>

            {shareCardOpen ? (
              <section id="share-card" className="dashboard-panel share-section" aria-labelledby="share-card-title">
                <SectionHeader icon={Share2} meta="可复制或导出">
                  <span id="share-card-title" tabIndex={-1}>今日卡片预览</span>
                </SectionHeader>
                <div className="share-section__layout">
                  <ShareCardPreview
                    ref={shareCardRef}
                    date={summary?.date ?? '—'}
                    effectiveWords={effectiveWordsValue}
                    readingTime={readingTimeValue}
                    pages={pagesTodayValue}
                    learningWords={learningWordsValue}
                    topDomain={topDomain}
                    fallbackText={shareCardText}
                  />
                  <div className="share-section__actions" aria-live="polite">
                    <p>今日阅读摘要</p>
                    <ActionButton icon={Clipboard} onClick={() => void copyShareCard()}>
                      {copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '复制失败' : '复制文案'}
                    </ActionButton>
                    <ActionButton icon={Download} onClick={() => void downloadShareCard()}>
                      {downloadStatus === 'downloaded' ? '已下载' : downloadStatus === 'failed' ? '导出失败' : '下载 PNG'}
                    </ActionButton>
                    {copyStatus === 'failed' || downloadStatus === 'failed'
                      ? <InlineNotice tone="danger">卡片操作失败，请重试。</InlineNotice>
                      : null}
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        <section id="reading-profile" className="dashboard-panel reading-profile" aria-labelledby="reading-profile-title">
          <SectionHeader icon={Gauge} meta={readingPaceValue}>
            <span id="reading-profile-title">阅读档案</span>
          </SectionHeader>

          {calibrationStep === 'idle' ? (
            <div className="reading-profile__summary">
              <p>{readingPaceLabel}</p>
              <ActionButton icon={Play} onClick={startPaceCalibration}>
                {paceSummary?.hasProfile ? '重新校准' : '开始校准'}
              </ActionButton>
            </div>
          ) : null}

          {calibrationStep === 'reading' ? (
            <div id="pace-calibration" className="calibration-flow">
              <div className="calibration-flow__heading">
                <div>
                  <p className="dashboard-kicker">速度校准 · {PACE_CALIBRATION_WORD_COUNT} words</p>
                  <h3>按平常速度阅读</h3>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="取消校准"
                  disabled={calibrationSaveStatus === 'saving'}
                  onClick={resetCalibration}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <article className="calibration-passage" lang="en">{PACE_CALIBRATION_PASSAGE}</article>
              <ActionButton variant="primary" icon={CheckCircle2} onClick={finishPaceReading}>我已读完</ActionButton>
            </div>
          ) : null}

          {calibrationStep === 'questions' ? (
            <div id="pace-calibration" className="calibration-flow" lang="en">
              <div className="calibration-flow__heading">
                <div>
                  <p className="dashboard-kicker">Comprehension check</p>
                  <h3>Answer three questions</h3>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="取消校准"
                  disabled={calibrationSaveStatus === 'saving'}
                  onClick={resetCalibration}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className="calibration-questions">
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
                  onClick={resetCalibration}
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
        </section>

        {viewState === 'ready' && details ? (
          <>
            <div className="dashboard-grid">
              <Panel title="近期阅读量" meta={`${details.recentPages.length} 个页面`} icon={BookOpen}>
                <div className="record-list">
                  {details.recentPages.length
                    ? details.recentPages.map((page) => <RecentPageCard key={page.pageId} page={page} />)
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
              <h2 id="local-data-title">本地数据</h2>
            </div>
            <p>清除阅读、词汇、摘录和速度档案；网站权限不变。</p>
          </div>
          <ActionButton
            variant="danger"
            disabled={clearBusy || calibrationSaveStatus === 'saving'}
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
    <section className="dashboard-loading" role="status" aria-label="正在读取本地数据" aria-busy="true">
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

const ShareCardPreview = ({
  ref,
  date,
  effectiveWords,
  readingTime,
  pages,
  learningWords,
  topDomain,
  fallbackText,
}: {
  ref: Ref<HTMLDivElement>;
  date: string;
  effectiveWords: string;
  readingTime: string;
  pages: string;
  learningWords: string;
  topDomain: string;
  fallbackText: string;
}) => (
  <div ref={ref} className="share-card-preview">
    <div className="share-card-preview__header">
      <span>今日英文阅读</span>
      <span>{date}</span>
    </div>
    <div className="share-card-preview__main">
      <p>今天计入 <strong>{effectiveWords}</strong> 个英文词</p>
    </div>
    <dl>
      <div><dt>阅读时间</dt><dd>{readingTime}</dd></div>
      <div><dt>页面</dt><dd>{pages} 页</dd></div>
      <div><dt>学习中词汇</dt><dd>{learningWords}</dd></div>
    </dl>
    <div className="share-card-preview__footer">
      <span title={topDomain}>{topDomain}</span>
      <strong>Yuel 阅量</strong>
    </div>
    <pre className="sr-only">{fallbackText}</pre>
  </div>
);

function RecentPageCard({ page }: { page: RecentPageSummary }) {
  const progress = page.totalWords > 0 ? Math.min(100, Math.round((page.effectiveWords / page.totalWords) * 100)) : 0;

  return (
    <article className="record-row">
      <div className="record-row__heading">
        <h3 title={page.domain}>{page.domain}</h3>
        <time dateTime={new Date(page.lastReadAt).toISOString()}>{formatDateTime(page.lastReadAt)}</time>
      </div>
      <p>{formatCount(page.effectiveWords)} / {formatCount(page.totalWords)} 词</p>
      {page.totalWords > 0 ? (
        <ProgressBar
          label={`${page.domain} 阅读进度`}
          value={page.effectiveWords}
          max={page.totalWords}
          valueText={`${formatCount(page.effectiveWords)} / ${formatCount(page.totalWords)} 词`}
        />
      ) : null}
    </article>
  );
}

function VocabularyCard({ vocab }: { vocab: RecentVocabularySummary }) {
  return (
    <article className="record-row vocabulary-row">
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

function scrollToSection(id: string) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

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
  if (summary.source === 'default') return '默认速度，等待校准或可靠样本。';
  if (summary.source === 'onboarding') {
    return summary.updatedAt ? `${formatDateTime(summary.updatedAt)} 完成校准` : '已完成初始校准';
  }
  return `${summary.sampleCount} 个可靠样本正在缓慢调整速度`;
}

function formatMinutes(value: number): string {
  if (value < 1 && value > 0) return '不足 1 分钟';
  return `${Math.round(value)} 分钟`;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatVocabularyStatus(status: RecentVocabularySummary['userStatus']): string {
  if (status === 'new') return '新词';
  if (status === 'learning') return '学习中';
  if (status === 'known') return '已掌握';
  return '已忽略';
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
