import { registerCollectorStatusResponder } from '../src/content/collectorStatus';
import { startReadingCollectorOnce } from '../src/content/startOnce';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    const collector = startReadingCollectorOnce();
    const stopReportingStatus = registerCollectorStatusResponder(() => ({
      url: window.location.href,
      collecting: collector.collecting,
    }));

    window.addEventListener('pagehide', () => {
      stopReportingStatus();
    }, { once: true });
  },
});
