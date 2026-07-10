import { describe, expect, it } from 'vitest';

import {
  STARTER_CONTENT_SCRIPT_MATCHES,
  STARTER_SITE_LABELS,
  isStarterSiteUrl,
} from './starterSites';

describe('starter sites', () => {
  it('derives display labels and content-script matches from the same definitions', () => {
    expect(STARTER_SITE_LABELS).toEqual(['MDN', 'GitHub', 'Medium', 'Wikipedia', 'arXiv']);
    expect(STARTER_CONTENT_SCRIPT_MATCHES).toEqual([
      'https://developer.mozilla.org/*',
      'https://github.com/*',
      'https://*.github.com/*',
      'https://medium.com/*',
      'https://*.medium.com/*',
      'https://en.wikipedia.org/*',
      'https://arxiv.org/*',
    ]);
  });

  it('matches only supported HTTPS starter hosts and configured subdomains', () => {
    expect(isStarterSiteUrl('https://gist.github.com/example')).toBe(true);
    expect(isStarterSiteUrl('https://publication.medium.com/article')).toBe(true);
    expect(isStarterSiteUrl('http://github.com/example')).toBe(false);
    expect(isStarterSiteUrl('https://example.com/article')).toBe(false);
  });
});
