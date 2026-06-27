import { describe, expect, it } from 'vitest';

import { validateChromeMv3Build } from './extensionBuildSmoke';

describe('Chrome MV3 build output', () => {
  it('contains the minimum viable extension runtime files and permission boundary', async () => {
    const result = await validateChromeMv3Build('.output/chrome-mv3');

    expect(result.manifest.manifest_version).toBe(3);
    expect(result.manifest.permissions).toEqual(['activeTab', 'alarms', 'contextMenus', 'idle', 'sidePanel', 'scripting', 'storage']);
    expect(result.manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(result.manifest.background?.service_worker).toBe('background.js');
    expect(result.manifest.action?.default_popup).toBe('popup.html');
    expect(result.manifest.side_panel?.default_path).toBe('sidepanel.html');
    expect(result.manifest.content_scripts?.[0]?.js).toEqual(['content-scripts/content.js']);
    expect(result.requiredFiles).toEqual([
      'manifest.json',
      'background.js',
      'popup.html',
      'dashboard.html',
      'sidepanel.html',
      'content-scripts/content.js',
    ]);
  });
});
