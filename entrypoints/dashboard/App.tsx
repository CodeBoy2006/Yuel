import { Activity, BookOpen, Boxes, Clipboard, Database, Download, Languages, LockKeyhole } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { clearLocalReadingData } from '../../src/storage/repositories';
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
}

const defaultDependencies: DashboardAppDependencies = {
  clearLocalReadingData,
  confirmClearLocalReadingData: () =>
    window.confirm('Clear all local Yuel reading data? Enabled sites and browser permissions will stay unchanged.'),
  copyTextToClipboard,
  exportSummaryCardPng: exportDashboardSummaryCardPng,
  getReadingDashboardDetails,
};

export function DashboardApp({ dependencies = defaultDependencies }: { dependencies?: DashboardAppDependencies }) {
  const [details, setDetails] = useState<ReadingDashboardDetails>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const [clearRefreshFailed, setClearRefreshFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloaded' | 'failed'>('idle');
  const shareCardRef = useRef<HTMLDivElement>(null);

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

    return () => {
      mounted = false;
    };
  }, [dependencies]);

  const summary = details?.summary;
  const statusText = loadFailed ? 'Local data unavailable' : details?.hasData ? 'Reading data loaded' : details ? 'No reading data yet' : 'Loading local data';
  const effectiveWordsValue = loadFailed ? 'Unavailable' : summary ? formatCount(summary.effectiveWords) : '...';
  const readingTimeValue = loadFailed ? 'Unavailable' : summary ? formatMinutes(summary.minutes) : '...';
  const pagesTodayValue = loadFailed ? 'Unavailable' : summary ? String(summary.readPages) : '...';
  const learningWordsValue = loadFailed ? 'Unavailable' : summary ? String(summary.learningWords) : '...';
  const shareCardText = loadFailed ? 'Local data unavailable' : details?.summaryCardText ?? 'Loading local data';
  const copyCardText = dependencies.copyTextToClipboard ?? copyTextToClipboard;
  const exportCardPng = dependencies.exportSummaryCardPng ?? exportDashboardSummaryCardPng;

  const clearData = async () => {
    if (!dependencies.confirmClearLocalReadingData()) {
      return;
    }

    setClearBusy(true);
    setClearFailed(false);
    setClearRefreshFailed(false);
    setLoadFailed(false);
    setCopyStatus('idle');
    setDownloadStatus('idle');

    try {
      await dependencies.clearLocalReadingData();
    } catch (error) {
      console.error('Failed to clear Yuel local data', error);
      setClearFailed(true);
      setClearBusy(false);
      return;
    }

    setDetails(undefined);

    try {
      setDetails(await dependencies.getReadingDashboardDetails());
    } catch (error) {
      console.error('Failed to refresh Yuel dashboard details after clearing local data', error);
      setLoadFailed(true);
      setClearRefreshFailed(true);
    } finally {
      setClearBusy(false);
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

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent pages</h2>
            <span className="text-sm text-stone-500">{details?.recentPages.length ?? 0} tracked</span>
          </div>
          <div className="mt-4 grid gap-3">
            {details?.recentPages.length ? (
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
            <span className="text-sm text-stone-500">{details?.recentVocabulary.length ?? 0} terms</span>
          </div>
          <div className="mt-4 grid gap-2">
            {details?.recentVocabulary.length ? (
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
            <span className="text-sm text-stone-500">{details?.recentSavedItems.length ?? 0} saved</span>
          </div>
          <div className="mt-4 grid gap-3">
            {details?.recentSavedItems.length ? (
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
