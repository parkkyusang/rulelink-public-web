import {defineConfig, devices} from '@playwright/test';

const mode = process.env.RULELINK_PRIVACY_MODE ?? 'default';
const port = Number(process.env.RULELINK_PRIVACY_PORT ?? '8898');

export default defineConfig({
  testDir: './e2e/privacy',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: {timeout: 12_000},
  outputDir: `test-results/privacy/${mode}/artifacts`,
  reporter: [
    ['list'],
    ['html', {
      open: 'never',
      outputFolder: `test-results/privacy/${mode}/html-report`,
    }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
