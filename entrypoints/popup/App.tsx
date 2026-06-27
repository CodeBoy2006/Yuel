import { BarChart3, BookOpen, ExternalLink, ShieldCheck, ToggleRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';

import {
  disableEnabledSite,
  enableCurrentTabSite,
  getCurrentTabSiteAccess,
  listEnabledSites,
  type EnabledSiteRecord,
  type SiteAccessState,
} from '../../src/permissions/siteAccess';
import { getTodayReadingSummary, type TodayReadingSummary } from '../../src/storage/readingStats';

const trackedHosts = ['MDN', 'GitHub', 'Medium', 'Wikipedia', 'arXiv'];

export function PopupApp() {
  const [summary, setSummary] = useState<TodayReadingSummary>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [siteAccess, setSiteAccess] = useState<SiteAccessState>();
  const [enabledSites, setEnabledSites] = useState<EnabledSiteRecord[]>([]);
  const [siteAccessBusy, setSiteAccessBusy] = useState(false);
  const [siteAccessFailed, setSiteAccessFailed] = useState(false);
  const [removingOrigin, setRemovingOrigin] = useState<string>();

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

  useEffect(() => {
    let mounted = true;

    void getCurrentTabSiteAccess()
      .then((nextAccess) => {
        if (!mounted) return;
        setSiteAccess(nextAccess);
      })
      .catch((error) => {
        console.error('Failed to load Yuel site access state', error);
        if (!mounted) return;
        setSiteAccessFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    void refreshEnabledSites().catch((error) => {
      console.error('Failed to load Yuel enabled sites', error);
      if (!mounted) return;
      setSiteAccessFailed(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const openDashboard = async () => {
    await browser.tabs.create({ url: new URL('/dashboard.html', window.location.href).toString() });
  };

  const refreshEnabledSites = async () => {
    setEnabledSites(await listEnabledSites());
  };

  const enableSite = async () => {
    setSiteAccessBusy(true);
    setSiteAccessFailed(false);

    try {
      const result = await enableCurrentTabSite();
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
            }
          : result,
      );
      await refreshEnabledSites();
    } catch (error) {
      console.error('Failed to enable Yuel on current site', error);
      setSiteAccessFailed(true);
    } finally {
      setSiteAccessBusy(false);
    }
  };

  const removeEnabledSite = async (origin: string) => {
    setRemovingOrigin(origin);
    setSiteAccessFailed(false);

    try {
      await disableEnabledSite(origin);
      await refreshEnabledSites();
      setSiteAccess((currentAccess) =>
        currentAccess?.supported && currentAccess.origin === origin
          ? { ...currentAccess, granted: false, enabled: false }
          : currentAccess,
      );
    } catch (error) {
      console.error('Failed to remove Yuel enabled site', error);
      setSiteAccessFailed(true);
    } finally {
      setRemovingOrigin(undefined);
    }
  };

  const hasLoaded = Boolean(summary) || loadFailed;
  const todayValue = summary ? formatWords(summary.effectiveWords) : 'Loading';
  const confidenceValue = loadFailed ? 'Unavailable' : summary?.hasData ? `${formatMinutes(summary.minutes)} read` : hasLoaded ? 'No data' : 'Loading';
  const pagesValue = summary ? `${summary.readPages} pages` : 'Loading';
  const learningValue = summary ? `${summary.learningWords} words` : 'Loading';
  const currentSiteEnabled = siteAccess?.supported ? siteAccess.enabled : false;
  const canEnableCurrentSite = Boolean(siteAccess?.supported && !siteAccess.enabled && !siteAccessBusy);

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
        <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Enabled sites</p>
          {enabledSites.length > 0 ? (
            <div className="grid gap-2">
              {enabledSites.map((site) => (
                <div key={site.origin} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-neutral-200">{site.host}</span>
                  <button
                    type="button"
                    disabled={removingOrigin === site.origin}
                    onClick={() => void removeEnabledSite(site.origin)}
                    className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs font-semibold text-neutral-300 hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {removingOrigin === site.origin ? 'Removing' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No custom sites enabled</p>
          )}
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
        <div className="mb-2 flex items-center gap-2">
          <ToggleRight className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Current site</p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
          <p className="text-sm font-semibold">{formatSiteAccessTitle(siteAccess, siteAccessFailed)}</p>
          <p className="mt-1 text-xs text-neutral-500">{formatSiteAccessDetail(siteAccess, siteAccessBusy)}</p>
          <button
            type="button"
            disabled={!canEnableCurrentSite}
            onClick={() => void enableSite()}
            className="mt-3 flex w-full items-center justify-center rounded-md border border-neutral-700 px-3 py-2 text-sm font-semibold text-neutral-100 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {siteAccessBusy ? 'Enabling...' : currentSiteEnabled ? 'Enabled' : 'Enable current site'}
          </button>
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

function formatSiteAccessTitle(siteAccess: SiteAccessState | undefined, failed: boolean): string {
  if (failed) return 'Permission status unavailable';
  if (!siteAccess) return 'Checking page';
  if (!siteAccess.supported) return siteAccess.reason;
  return siteAccess.host;
}

function formatSiteAccessDetail(siteAccess: SiteAccessState | undefined, busy: boolean): string {
  if (busy) return 'Requesting optional host permission';
  if (!siteAccess) return 'Loading current tab';
  if (!siteAccess.supported) return 'Open an http or https page to enable tracking';
  if (siteAccess.enabled) return 'Yuel can collect reading events on this site';
  if (siteAccess.granted) return 'Permission is granted; click to enable tracking';
  return 'Grant permission only for this site';
}
