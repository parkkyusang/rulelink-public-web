import {defineConfig, devices} from '@playwright/test';

const port = Number(process.env.RULELINK_SECURITY_HEADERS_PORT ?? '8903');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e/security-headers',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: {timeout: 12_000},
  outputDir: 'test-results/security-headers/artifacts',
  reporter: [
    ['list'],
    ['html', {
      open: 'never',
      outputFolder: 'test-results/security-headers/html-report',
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
    command: `node e2e/discovery/support/start-discovery-build.mjs --port ${port}`,
    url: `${baseURL}/publication.json`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
