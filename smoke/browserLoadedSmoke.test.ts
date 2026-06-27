import { describe, expect, it } from 'vitest';

import { validateBrowserLoadedExtension } from './browserLoadedSmoke';

describe('browser-loaded extension smoke', () => {
  it('loads the built extension pages in Chrome', async () => {
    const result = await validateBrowserLoadedExtension('.output/chrome-mv3');

    expect(result.extensionId).toMatch(/^[a-p]{32}$/);
    expect(result.dashboardText).toContain('Local reading dashboard');
    expect(result.popupText).toContain('Yuel Reading');
  }, 30_000);
});
