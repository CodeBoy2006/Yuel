import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Yuel Reading',
    short_name: 'Yuel',
    description: 'Local-first English reading analytics and pack-based vocabulary insights.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    permissions: ['activeTab', 'alarms', 'contextMenus', 'idle', 'sidePanel', 'scripting', 'storage'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
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
  },
});
