import { Activity, BookMarked, BookOpen, Database, ExternalLink, Languages, Layers3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import { getTodayReadingSummary, type TodayReadingSummary } from '../../src/storage/readingStats';

const pipeline = [
  { label: 'Observe', detail: 'Visible text blocks' },
  { label: 'Analyze', detail: 'English tokens and pack rules' },
  { label: 'Remember', detail: 'IndexedDB exposure data' },
];

export interface SidePanelAppDependencies {
  getTodayReadingSummary: typeof getTodayReadingSummary;
  openDashboard: () => Promise<void>;
}

const defaultDependencies: SidePanelAppDependencies = {
  getTodayReadingSummary,
  openDashboard: async () => {
    await browser.tabs.create({ url: new URL('/dashboard.html', window.location.href).toString() });
  },
};

export function SidePanelApp({ dependencies = defaultDependencies }: { dependencies?: SidePanelAppDependencies }) {
  const [summary, setSummary] = useState<TodayReadingSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
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

    return () => {
      mounted = false;
    };
  }, [dependencies]);

  const hasLoaded = Boolean(summary) || loadFailed;
  const statusText = loadFailed ? 'Local data unavailable' : summary?.hasData ? 'Reading data loaded' : hasLoaded ? 'No reading data yet' : 'Loading local data';
  const topDomain = summary?.topDomains[0] ?? 'No top domain yet';
  const todayValue = loadFailed ? 'Unavailable' : summary ? formatWords(summary.effectiveWords) : 'Loading';
  const timeValue = loadFailed ? 'Unavailable' : summary ? `${formatMinutes(summary.minutes)} read` : 'Loading';
  const pagesValue = loadFailed ? 'Unavailable' : summary ? `${summary.readPages} pages` : 'Loading';
  const learningValue = loadFailed ? 'Unavailable' : summary ? `${summary.learningWords} words` : 'Loading';

  const openDashboard = async () => {
    setDashboardBusy(true);
    setDashboardFailed(false);

    try {
      await dependencies.openDashboard();
    } catch (error) {
      console.error('Failed to open Yuel dashboard from side panel', error);
      setDashboardFailed(true);
    } finally {
      setDashboardBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <BookMarked className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h1 className="text-base font-semibold">Reading companion</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-600">{statusText}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 px-4 py-4">
        <Metric label="Today" value={todayValue} icon={BookOpen} />
        <Metric label="Time" value={timeValue} icon={Activity} />
        <Metric label="Pages" value={pagesValue} icon={Database} />
        <Metric label="Learning" value={learningValue} icon={Languages} />
      </section>

      <section className="px-4 pb-4">
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top domain</p>
          <p className="mt-1 truncate text-sm font-semibold">{topDomain}</p>
        </div>
      </section>

      <section className="px-4 pb-4">
        <button
          type="button"
          disabled={dashboardBusy}
          onClick={() => void openDashboard()}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {dashboardBusy ? 'Opening dashboard' : 'Open dashboard'}
        </button>
        {dashboardFailed ? <p className="mt-2 text-center text-xs text-red-600">Dashboard unavailable</p> : null}
      </section>

      <section className="grid gap-3 px-4 py-4">
        {pipeline.map((item, index) => (
          <div key={item.label} className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2">
              {index === 0 ? <Layers3 className="h-4 w-4" /> : <Database className="h-4 w-4" />}
              <p className="text-sm font-semibold">{item.label}</p>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <Icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
      <p className="mt-2 text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
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
