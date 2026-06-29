import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['smoke/largeTextStress.test.ts'],
    testTimeout: 75_000,
  },
});
