import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 25_000,
  },
  forbidOnly: Boolean(process.env.CI),
  outputDir: 'test-results/playwright',
  reporter: [['line']],
  use: {
    headless: process.env.YUEL_BROWSER_SMOKE_HEADLESS !== 'false',
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1_440, height: 1_040 },
  },
});
