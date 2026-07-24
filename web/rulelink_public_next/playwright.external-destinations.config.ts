import {defineConfig, devices} from '@playwright/test';

const mode = process.env.RULELINK_EXTERNAL_DESTINATIONS_MODE ?? 'default';
const port = Number(process.env.RULELINK_EXTERNAL_DESTINATIONS_PORT ?? '8899');

export default defineConfig({
  expect: {timeout: 12_000},
  fullyParallel: false,
  outputDir: `test-results/external-destinations/${mode}/artifacts`,
  reporter: [['list']],
  retries: process.env.CI ? 1 : 0,
  testDir: './e2e/external-destinations',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'ko-KR',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    video: 'off',
  },
  workers: 1,
});
