import { BarChart3, BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';

import { getTodayReadingSummary, type TodayReadingSummary } from '../../src/storage/readingStats';

const trackedHosts = ['MDN', 'GitHub', 'Medium', 'Wikipedia', 'arXiv'];

export function PopupApp() {
  const [summary, setSummary] = useState<TodayReadingSummary>();
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    void getTodayReadingSummary()
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
  }, []);

  const openDashboard = async () => {
    await browser.tabs.create({ url: new URL('/dashboard.html', window.location.href).toString() });
  };

  const hasLoaded = Boolean(summary) || loadFailed;
  const todayValue = summary ? formatWords(summary.effectiveWords) : 'Loading';
  const confidenceValue = loadFailed ? 'Unavailable' : summary?.hasData ? `${formatMinutes(summary.minutes)} read` : hasLoaded ? 'No data' : 'Loading';
  const pagesValue = summary ? `${summary.readPages} pages` : 'Loading';
  const learningValue = summary ? `${summary.learningWords} words` : 'Loading';

  return (
    <main className="w-[360px] bg-neutral-950 text-neutral-100">
      <section className="border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Yuel Reading</h1>
            <p className="text-xs text-neutral-400">Local-first reading telemetry</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 px-4 py-3">
        <Metric icon={<BookOpen className="h-4 w-4" />} label="Today" value={todayValue} />
        <Metric icon={<BarChart3 className="h-4 w-4" />} label="Time" value={confidenceValue} />
        <Metric icon={<BookOpen className="h-4 w-4" />} label="Pages" value={pagesValue} />
        <Metric icon={<BarChart3 className="h-4 w-4" />} label="Learning" value={learningValue} />
      </section>

      <section className="px-4 pb-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Starter sites</p>
        <div className="flex flex-wrap gap-1.5">
          {trackedHosts.map((host) => (
            <span key={host} className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
              {host}
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-800 px-4 py-3">
        <button
          type="button"
          onClick={() => void openDashboard()}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open dashboard
        </button>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
      <div className="mb-2 text-emerald-400">{icon}</div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatWords(words: number): string {
  return `${Math.round(words).toLocaleString()} words`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) {
    return '<1 min';
  }

  return `${Math.round(minutes)} min`;
}
