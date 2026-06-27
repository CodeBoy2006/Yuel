import { Activity, BookOpen, Boxes, Database, Languages, LockKeyhole } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getReadingDashboardDetails, type ReadingDashboardDetails } from '../../src/storage/readingStats';

const pillars = [
  { icon: Activity, title: 'Event driven', text: 'Content scripts emit reading behavior events instead of long-running background timers.' },
  { icon: Database, title: 'Local memory', text: 'IndexedDB stores event, chunk, vocabulary, saved item, and aggregate tables.' },
  { icon: Boxes, title: 'Pack ready', text: 'Packs are declarative JSON data: lexicon, phrase, scoring, and template rules.' },
  { icon: LockKeyhole, title: 'Privacy first', text: 'The scaffold stores hashes by default and keeps raw text only for user-saved items.' },
];

export interface DashboardAppDependencies {
  getReadingDashboardDetails: typeof getReadingDashboardDetails;
}

const defaultDependencies: DashboardAppDependencies = {
  getReadingDashboardDetails,
};

export function DashboardApp({ dependencies = defaultDependencies }: { dependencies?: DashboardAppDependencies }) {
  const [details, setDetails] = useState<ReadingDashboardDetails>();
  const [loadFailed, setLoadFailed] = useState(false);

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
            <p className="rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-600">{statusText}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-3 px-6 py-6 md:grid-cols-4">
        <Metric label="Effective words" value={summary ? formatCount(summary.effectiveWords) : '...'} icon={BookOpen} />
        <Metric label="Reading time" value={summary ? formatMinutes(summary.minutes) : '...'} icon={Activity} />
        <Metric label="Pages today" value={summary ? String(summary.readPages) : '...'} icon={Database} />
        <Metric label="Learning words" value={summary ? String(summary.learningWords) : '...'} icon={Languages} />
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
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-stone-500">No vocabulary exposure recorded yet.</p>
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
