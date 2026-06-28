import { Activity, BookOpen, Boxes, CheckCircle2, Clipboard, Database, Download, Gauge, Languages, LockKeyhole, Play } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { DEFAULT_BASE_WORDS_PER_MINUTE } from '../../src/domain/metrics';
import { clearLocalReadingData } from '../../src/storage/repositories';
import {
  getReadingPaceSummary,
  saveOnboardingReadingPaceCalibration,
  type ReadingPaceSummary,
} from '../../src/storage/readingPace';
import { getReadingDashboardDetails, type ReadingDashboardDetails } from '../../src/storage/readingStats';
import { exportSummaryCardPng as exportSummaryCardImage } from '../../src/ui/shareCardImage';

const pillars = [
  { icon: Activity, title: 'Event driven', text: 'Content scripts emit reading behavior events instead of long-running background timers.' },
  { icon: Database, title: 'Local memory', text: 'IndexedDB stores event, chunk, vocabulary, saved item, and aggregate tables.' },
  { icon: Boxes, title: 'Pack ready', text: 'Packs are declarative JSON data: lexicon, phrase, scoring, and template rules.' },
  { icon: LockKeyhole, title: 'Privacy first', text: 'The scaffold stores hashes by default and keeps raw text only for user-saved items.' },
];

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
    window.confirm('Clear all local Yuel reading data? Enabled sites and browser permissions will stay unchanged.'),
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
  const statusText = loadFailed ? 'Local data unavailable' : details?.hasData ? 'Reading data loaded' : details ? 'No reading data yet' : 'Loading local data';
  const effectiveWordsValue = loadFailed ? 'Unavailable' : summary ? formatCount(summary.effectiveWords) : '...';
  const readingTimeValue = loadFailed ? 'Unavailable' : summary ? formatMinutes(summary.minutes) : '...';
  const pagesTodayValue = loadFailed ? 'Unavailable' : summary ? String(summary.readPages) : '...';
  const learningWordsValue = loadFailed ? 'Unavailable' : summary ? String(summary.learningWords) : '...';
  const shareCardText = loadFailed ? 'Local data unavailable' : details?.summaryCardText ?? 'Loading local data';
  const detailPanelFallbackText = loadFailed ? 'Local data unavailable.' : 'Loading local data...';
  const readingPaceValue = paceLoadFailed ? 'Unavailable' : paceSummary ? `${Math.round(paceSummary.baseWordsPerMinute)} WPM` : '...';
  const readingPaceLabel = paceLoadFailed ? 'Pace unavailable' : paceSummary ? formatPaceSource(paceSummary) : 'Loading pace';
  const copyCardText = dependencies.copyTextToClipboard ?? copyTextToClipboard;
  const exportCardPng = dependencies.exportSummaryCardPng ?? exportDashboardSummaryCardPng;
  const allCalibrationQuestionsAnswered = paceCalibrationQuestions.every((question) => calibrationAnswers[question.id]);

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
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Yuel Reading V0.1</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Local reading dashboard</h1>
              <p className="mt-3 max-w-2xl text-base text-stone-600">
                Track effective words, reading time, recent pages, and vocabulary exposure from local browser data.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-600">{statusText}</p>
              <button
                type="button"
                disabled={clearBusy}
                onClick={() => void clearData()}
                className="rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {clearBusy ? 'Clearing...' : 'Clear local data'}
              </button>
            </div>
          </div>
          {clearFailed ? <p className="mt-3 text-sm font-medium text-red-700">Clear failed; local data was not changed.</p> : null}
          {clearRefreshFailed ? <p className="mt-3 text-sm font-medium text-red-700">Local data cleared, but dashboard refresh failed.</p> : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-3 px-6 py-6 md:grid-cols-4">
        <Metric label="Effective words" value={effectiveWordsValue} icon={BookOpen} />
        <Metric label="Reading time" value={readingTimeValue} icon={Activity} />
        <Metric label="Pages today" value={pagesTodayValue} icon={Database} />
        <Metric label="Learning words" value={learningWordsValue} icon={Languages} />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-6">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                <h2 className="text-lg font-semibold">Reading pace</h2>
              </div>
              <p className="mt-2 text-sm text-stone-600">{readingPaceLabel}</p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <p className="text-2xl font-semibold">{readingPaceValue}</p>
              <button
                type="button"
                onClick={startPaceCalibration}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-emerald-300 hover:text-emerald-700"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Start calibration
              </button>
            </div>
          </div>

          {calibrationStep === 'reading' ? (
            <div className="mt-5 border-t border-stone-200 pt-5">
              <p className="text-sm font-semibold text-stone-700">{PACE_CALIBRATION_WORD_COUNT} words</p>
              <p className="mt-3 text-sm leading-7 text-stone-700">{PACE_CALIBRATION_PASSAGE}</p>
              <button
                type="button"
                onClick={finishPaceReading}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                I finished reading
              </button>
            </div>
          ) : null}

          {calibrationStep === 'questions' ? (
            <div className="mt-5 border-t border-stone-200 pt-5">
              <div className="grid gap-4">
                {paceCalibrationQuestions.map((question) => (
                  <fieldset key={question.id}>
                    <legend className="text-sm font-semibold text-stone-800">{question.prompt}</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.options.map((option) => {
                        const selected = calibrationAnswers[question.id] === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setCalibrationAnswers((answers) => ({ ...answers, [question.id]: option.id }))}
                            className={`rounded-md border px-3 py-2 text-sm font-medium ${
                              selected
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                : 'border-stone-300 text-stone-700 hover:border-emerald-300 hover:text-emerald-700'
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
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {calibrationSaveStatus === 'saving' ? 'Saving...' : 'Save calibration'}
                </button>
                {calibrationSaveStatus === 'failed' ? <p className="text-sm font-medium text-red-700">Calibration save failed.</p> : null}
              </div>
            </div>
          ) : null}

          {calibrationSaveStatus === 'saved' ? (
            <p className="mt-4 text-sm font-medium text-emerald-800">Calibration saved.</p>
          ) : null}
        </section>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent pages</h2>
            <span className="text-sm text-stone-500">{details ? `${details.recentPages.length} tracked` : '...'}</span>
          </div>
          <div className="mt-4 grid gap-3">
            {!details ? (
              <p className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500">{detailPanelFallbackText}</p>
            ) : details.recentPages.length ? (
              details.recentPages.map((page) => (
                <div key={page.pageId} className="rounded-md border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{page.domain}</p>
                    <p className="text-xs text-stone-500">{formatDateTime(page.lastReadAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">
                    {formatCount(page.effectiveWords)} effective words from {formatCount(page.totalWords)} detected words
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500">No pages have been tracked yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Vocabulary exposure</h2>
            <span className="text-sm text-stone-500">{details ? `${details.recentVocabulary.length} terms` : '...'}</span>
          </div>
          <div className="mt-4 grid gap-2">
            {!details ? (
              <p className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500">{detailPanelFallbackText}</p>
            ) : details.recentVocabulary.length ? (
              details.recentVocabulary.map((vocab) => (
                <div key={vocab.lemma} className="rounded-md border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{vocab.lemma}</p>
                    <p className="text-xs uppercase text-stone-500">{vocab.userStatus}</p>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">
                    Seen {vocab.seenCount} times, effective {vocab.effectiveSeenCount}
                    {vocab.savedCount > 0 ? `, Saved ${vocab.savedCount}` : ''}
                  </p>
                  {vocab.packTags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {vocab.packTags.map((tag) => (
                        <span key={tag} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500">No vocabulary exposure recorded yet.</p>
            )}
          </div>
        </section>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-6">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Share card</h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={!details}
                onClick={() => void copyShareCard()}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Clipboard className="h-4 w-4" aria-hidden="true" />
                {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy card text'}
              </button>
              <button
                type="button"
                disabled={!details}
                onClick={() => void downloadShareCard()}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {downloadStatus === 'downloaded' ? 'Downloaded' : downloadStatus === 'failed' ? 'Export failed' : 'Download PNG'}
              </button>
            </div>
          </div>
          <div ref={shareCardRef} className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-700">Yuel Reading</p>
            <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
              {shareCardText}
            </pre>
          </div>
        </section>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-6">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Saved selections</h2>
            <span className="text-sm text-stone-500">{details ? `${details.recentSavedItems.length} saved` : '...'}</span>
          </div>
          <div className="mt-4 grid gap-3">
            {!details ? (
              <p className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500">{detailPanelFallbackText}</p>
            ) : details.recentSavedItems.length ? (
              details.recentSavedItems.map((item) => (
                <div key={item.id} className="rounded-md border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase text-emerald-700">{item.type}</p>
                    <p className="text-xs text-stone-500">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{item.text}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <span>{item.sourceDomain}</span>
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded border border-stone-200 px-2 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                No saved selections yet.
              </p>
            )}
          </div>
        </section>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-6 md:grid-cols-2">
        {pillars.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-md border border-stone-200 bg-white p-5">
            <Icon className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
          </article>
        ))}
      </section>
    </main>
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

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <article className="rounded-md border border-stone-200 bg-white p-4">
      <Icon className="h-5 w-5 text-emerald-700" aria-hidden="true" />
      <p className="mt-3 text-sm text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </article>
  );
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
  if (summary.source === 'default') {
    return 'Default pace until calibration or high confidence reading samples are available.';
  }

  if (summary.source === 'onboarding') {
    return summary.updatedAt ? `Onboarding calibrated ${formatDateTime(summary.updatedAt)}` : 'Onboarding calibrated';
  }

  return `${summary.sampleCount} adaptive samples`;
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

async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API unavailable');
  }

  await navigator.clipboard.writeText(text);
}

async function exportDashboardSummaryCardPng(element: HTMLElement, filename: string): Promise<void> {
  await exportSummaryCardImage(element, { filename });
}
