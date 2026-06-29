import { describe, expect, it } from 'vitest';

import { validateBrowserDomTextExtraction, validateBrowserSpaDynamicCollector } from './browserDomSmoke';

describe('browser DOM smoke', () => {
  it('runs text block extraction against a real browser DOM', async () => {
    const result = await validateBrowserDomTextExtraction();

    expect(result.documentReadyState).toBe('complete');
    expect(result.pageDomain).toBe('127.0.0.1');
    expect(result.selectors).toEqual(['p#visible', 'p#second']);
    expect(result.texts.join(' ')).toContain('Budgeted reading analytics depend on browser layout APIs');
    expect(result.texts.join(' ')).not.toContain('Hidden implementation notes');
    expect(result.texts.join(' ')).not.toContain('Navigation text');
    expect(result.firstBlockRect.width).toBeGreaterThan(0);
    expect(result.firstRangeRect.width).toBeGreaterThan(0);
  });

  it('refreshes collector snapshots for SPA injection and route replacement in a real browser DOM', async () => {
    const result = await validateBrowserSpaDynamicCollector();

    expect(result.finalHref).toContain('/next-spa-route');
    expect(result.messageCount).toBeGreaterThanOrEqual(3);
    expect(result.eventKinds).toContain('PageVisible');
    expect(result.eventKinds).toContain('PageHidden');
    expect(result.selectors).toEqual(expect.arrayContaining(['p#initial-route', 'p#injected-route', 'p#next-route']));
    expect(new Set(result.pageIds).size).toBeGreaterThanOrEqual(2);
  });
});
