import { describe, expect, it } from 'vitest';

import {
  validateBrowserLoadedExtension,
  validateBrowserRuntimeReadingLoop,
  validateBrowserStarterSiteContentScriptLoop,
} from './browserLoadedSmoke';

describe('browser-loaded extension smoke', () => {
  it('loads the built extension pages in Chrome', async () => {
    const result = await validateBrowserLoadedExtension('.output/chrome-mv3');

    expect(result.extensionId).toMatch(/^[a-p]{32}$/);
    expect(result.dashboardText).toContain('Local reading dashboard');
    expect(result.popupText).toContain('Yuel Reading');
  }, 30_000);

  it('records reading data through the loaded extension runtime', async () => {
    const result = await validateBrowserRuntimeReadingLoop('.output/chrome-mv3');

    expect(result.extensionId).toMatch(/^[a-p]{32}$/);
    expect(result.dashboardText).toContain('runtime-loop.example');
    expect(result.dashboardText).toContain('Effective words');
    expect(result.dashboardText).not.toContain('No reading data yet');
  }, 30_000);

  it('records reading data from a starter-site content script', async () => {
    const result = await validateBrowserStarterSiteContentScriptLoop('.output/chrome-mv3');

    expect(result.extensionId).toMatch(/^[a-p]{32}$/);
    expect(result.pageText).toContain('Starter content script reading loop');
    expect(result.dashboardText).toContain('developer.mozilla.org');
    expect(result.dashboardText).not.toContain('No reading data yet');
  }, 45_000);
});
