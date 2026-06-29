import { describe, expect, it } from 'vitest';

import { validateBrowserDomTextExtraction } from './browserDomSmoke';

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
});
