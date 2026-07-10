import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createWebsiteFaviconUrl, SiteFavicon } from './siteFavicon';
import { renderForSmoke } from './renderTest';

describe('site favicon', () => {
  it('builds a Chrome-local favicon URL for a normalized website domain', () => {
    expect(createWebsiteFaviconUrl('Developer.Mozilla.org', (path) => `chrome-extension://yuel${path}`)).toBe(
      'chrome-extension://yuel/_favicon/?pageUrl=https%3A%2F%2Fdeveloper.mozilla.org%2F&size=32',
    );
  });

  it.each(['', 'unknown', 'example.com/path'])('rejects a non-domain value: %s', (domain) => {
    expect(createWebsiteFaviconUrl(domain, vi.fn())).toBeUndefined();
  });

  it('renders a decorative site icon and falls back when it cannot load', async () => {
    const container = await renderForSmoke(
      <SiteFavicon
        domain="developer.mozilla.org"
        resolveUrl={(domain) => `chrome-extension://yuel/_favicon/?domain=${domain}`}
      />,
    );
    const image = container.querySelector<HTMLImageElement>('.record-row__favicon img');

    expect(image?.getAttribute('src')).toContain('developer.mozilla.org');
    expect(image?.getAttribute('alt')).toBe('');

    await act(async () => image?.dispatchEvent(new Event('error')));

    expect(container.querySelector('.record-row__favicon img')).toBeNull();
    expect(container.querySelector('.record-row__favicon svg')).not.toBeNull();
  });
});
