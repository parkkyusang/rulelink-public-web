import {defineConfig, devices} from '@playwright/test';

const port = Number(process.env.RULELINK_TRUST_FIXTURE_PORT ?? '8892');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e/trust',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {timeout: 10_000},
  outputDir: 'test-results/trust-readiness/artifacts',
  reporter: [
    ['list'],
    ['html', {
      open: 'never',
      outputFolder: 'test-results/trust-readiness/html-report',
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
  webServer: {
    command: `node e2e/trust/support/start-trust-fixture-build.mjs --port ${port}`,
    url: `${baseURL}/ko/trust`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
