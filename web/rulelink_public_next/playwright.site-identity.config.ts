import {defineConfig, devices} from '@playwright/test';

const port = Number(process.env.RULELINK_SITE_IDENTITY_PORT ?? '8894');

export default defineConfig({
  testDir: './e2e/site-identity',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {timeout: 12_000},
  outputDir: `test-results/site-identity/${process.env.RULELINK_SITE_IDENTITY_MODE ?? 'default'}`,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `node e2e/site-identity/support/start-site-identity-build.mjs --port ${port}`,
    url: `http://127.0.0.1:${port}/publication.json`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
