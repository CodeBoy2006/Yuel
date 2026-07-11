import { describe, expect, it } from 'vitest';

import { validateChromeMv3Build } from './extensionBuildSmoke';

describe('Chrome MV3 build output', () => {
  it('contains the extension runtime files and required all-site access', async () => {
    const result = await validateChromeMv3Build('.output/chrome-mv3');

    expect(result.manifest.manifest_version).toBe(3);
    expect(result.manifest.permissions).toEqual(['activeTab', 'alarms', 'contextMenus', 'favicon', 'idle', 'sidePanel', 'scripting', 'storage', 'tabs']);
    expect(result.manifest.host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(result.manifest.icons).toEqual({
      16: 'icon/16.png',
      24: 'icon/24.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    });
    expect(result.manifest.background?.service_worker).toBe('background.js');
    expect(result.manifest.action?.default_popup).toBe('popup.html');
    expect(result.manifest.action?.default_icon).toEqual({
      16: 'icon/16.png',
      24: 'icon/24.png',
      32: 'icon/32.png',
    });
    expect(result.manifest.side_panel?.default_path).toBe('sidepanel.html');
    expect(result.manifest.content_scripts?.[0]?.js).toEqual(['content-scripts/content.js']);
    expect(result.manifest.content_scripts?.[0]?.matches).toEqual(['http://*/*', 'https://*/*']);
    expect(result.requiredFiles).toEqual([
      'manifest.json',
      'background.js',
      'popup.html',
      'dashboard.html',
      'sidepanel.html',
      'content-scripts/content.js',
      'logo.svg',
      'icon/16.png',
      'icon/24.png',
      'icon/32.png',
      'icon/48.png',
      'icon/96.png',
      'icon/128.png',
    ]);
  });
});
