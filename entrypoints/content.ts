import { registerCollectorStatusResponder } from '../src/content/collectorStatus';
import { watchEnabledSiteAccess } from '../src/content/enabledSiteLifecycle';
import { startReadingCollectorOnce, stopReadingCollectorOnce } from '../src/content/startOnce';
import { STARTER_CONTENT_SCRIPT_MATCHES } from '../src/permissions/starterSites';

export default defineContentScript({
  matches: [...STARTER_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_idle',
  main() {
    const collector = startReadingCollectorOnce();
    const stopReportingStatus = registerCollectorStatusResponder(() => ({
      url: window.location.href,
      collecting: collector.collecting,
    }));
    let stopWatching: () => void = () => undefined;
    const stopForDisabledSite = () => {
      stopReportingStatus();
      stopReadingCollectorOnce();
      stopWatching();
    };

    stopWatching = watchEnabledSiteAccess(window.location.href, stopForDisabledSite);
    window.addEventListener('pagehide', () => {
      stopReportingStatus();
      stopWatching();
    }, { once: true });
  },
});
