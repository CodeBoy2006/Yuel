import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['smoke/realPageCorpusSmoke.test.ts'],
    testTimeout: 240_000,
  },
});
