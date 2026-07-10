import { watchEnabledSiteAccess } from '../src/content/enabledSiteLifecycle';
import { startReadingCollectorOnce, stopReadingCollectorOnce } from '../src/content/startOnce';
import { STARTER_CONTENT_SCRIPT_MATCHES } from '../src/permissions/starterSites';

export default defineContentScript({
  matches: [...STARTER_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_idle',
  main() {
    startReadingCollectorOnce();
    const stopWatching = watchEnabledSiteAccess(window.location.href, () => {
      stopReadingCollectorOnce();
    });
    window.addEventListener('pagehide', stopWatching, { once: true });
  },
});
