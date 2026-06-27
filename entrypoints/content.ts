import { startReadingCollector } from '../src/content/collector';

export default defineContentScript({
  matches: [
    'https://developer.mozilla.org/*',
    'https://github.com/*',
    'https://*.github.com/*',
    'https://medium.com/*',
    'https://*.medium.com/*',
    'https://en.wikipedia.org/*',
    'https://arxiv.org/*',
  ],
  runAt: 'document_idle',
  main() {
    startReadingCollector();
  },
});
