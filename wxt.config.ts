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
    action: {
      default_title: 'Yuel Reading',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
