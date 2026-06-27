import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['smoke/extensionBuildSmoke.test.ts'],
  },
});
