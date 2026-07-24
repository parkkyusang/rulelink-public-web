import {defineConfig, devices} from '@playwright/test';

const baseURL = process.env.RULELINK_PERFORMANCE_BASE_URL
  ?? 'http://127.0.0.1:8897';

export default defineConfig({
  testDir: './e2e/performance',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {timeout: 12_000},
  outputDir: 'test-results/performance/playwright-artifacts',
  reporter: [
    ['list'],
    ['html', {
      open: 'never',
      outputFolder: 'test-results/performance/playwright-report',
    }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
