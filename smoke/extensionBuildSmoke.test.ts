import { describe, expect, it } from 'vitest';

import { validateChromeMv3Build } from './extensionBuildSmoke';

describe('Chrome MV3 build output', () => {
  it('contains the extension runtime files and required all-site access', async () => {
    const result = await validateChromeMv3Build('.output/chrome-mv3');

    expect(result.manifest.manifest_version).toBe(3);
    expect(result.manifest.permissions).toEqual([
      'activeTab',
      'alarms',
      'contextMenus',
      'declarativeNetRequestWithHostAccess',
      'favicon',
      'idle',
      'sidePanel',
      'scripting',
      'storage',
      'tabs',
    ]);
    expect(result.manifest.host_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(result.manifest.mime_types_handler).toEqual({
      'application/pdf': {
        handler_url: 'pdf-reader.html',
        can_embed: false,
      },
    });
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
    expect(result.manifest.content_security_policy?.extension_pages).toBe(
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    );
    expect(result.manifest.content_scripts?.[0]?.js).toEqual(['content-scripts/content.js']);
    expect(result.manifest.content_scripts?.[0]?.matches).toEqual(['http://*/*', 'https://*/*']);
    expect(result.manifest.web_accessible_resources).toContainEqual({
      resources: ['pdf-reader.html'],
      matches: ['http://*/*', 'https://*/*'],
      use_dynamic_url: false,
    });
    expect(result.requiredFiles).toEqual([
      'manifest.json',
      'background.js',
      'popup.html',
      'dashboard.html',
      'pdf-reader.html',
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
    expect(result.wasmFiles).toHaveLength(1);
    expect(result.wasmFiles[0]).toMatch(/pdfium.*\.wasm$/);
  });
});
