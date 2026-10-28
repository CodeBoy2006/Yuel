import path from 'node:path';

import {
  defineConfig,
  type UserManifest,
} from 'wxt';

type PdfHandlerManifest = UserManifest & {
  mime_types_handler: {
    'application/pdf': {
      handler_url: string;
      can_embed: boolean;
    };
  };
};

const manifest: PdfHandlerManifest = {
  name: 'Yuel Reading',
  short_name: 'Yuel',
  description: 'Local-first English reading analytics and pack-based vocabulary insights.',
  version: '0.1.0',
  minimum_chrome_version: '116',
  permissions: [
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
  ],
  host_permissions: ['http://*/*', 'https://*/*'],
  icons: {
    '16': 'icon/16.png',
    '24': 'icon/24.png',
    '32': 'icon/32.png',
    '48': 'icon/48.png',
    '96': 'icon/96.png',
    '128': 'icon/128.png',
  },
  action: {
    default_title: 'Yuel Reading',
    default_icon: {
      '16': 'icon/16.png',
      '24': 'icon/24.png',
      '32': 'icon/32.png',
    },
  },
  side_panel: {
    default_path: 'sidepanel.html',
  },
  web_accessible_resources: [{
    resources: ['pdf-reader.html'],
    matches: ['http://*/*', 'https://*/*'],
    use_dynamic_url: false,
  }],
  mime_types_handler: {
    'application/pdf': {
      handler_url: 'pdf-reader.html',
      can_embed: false,
    },
  },
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
};

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  webExt: {
    disabled: true,
  },
  hooks: {
    'build:publicAssets': (wxt, files) => {
      for (const file of ['LICENSE', 'LICENSES/PolyForm-Strict-1.0.0.txt', 'CONTRIBUTING.md']) {
        files.push({
          absoluteSrc: path.resolve(wxt.config.root, file),
          relativeDest: file,
        });
      }
    },
  },
  manifest,
});
