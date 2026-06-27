import { startReadingCollectorOnce } from '../src/content/startOnce';
import { STARTER_CONTENT_SCRIPT_MATCHES } from '../src/permissions/starterSites';

export default defineContentScript({
  matches: [...STARTER_CONTENT_SCRIPT_MATCHES],
  runAt: 'document_idle',
  main() {
    startReadingCollectorOnce();
  },
});
