import {defineConfig, devices} from '@playwright/test';

const mode = process.env.RULELINK_ACCESSIBILITY_MODE ?? 'default';
const port = Number(process.env.RULELINK_ACCESSIBILITY_PORT ?? '8894');
const baseURL = `http://127.0.0.1:${port}`;
const serverCommand = mode === 'trust'
  ? `node e2e/trust/support/start-trust-fixture-build.mjs --port ${port}`
  : mode === 'authority'
    ? `node e2e/authority/support/start-fixture-build.mjs --port ${port}`
    : `node e2e/discovery/support/start-discovery-build.mjs --port ${port}`;

export default defineConfig({
  testDir: './e2e/accessibility',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: {timeout: 12_000},
  outputDir: `test-results/accessibility/${mode}/artifacts`,
  reporter: [
    ['list'],
    ['html', {
      open: 'never',
      outputFolder: `test-results/accessibility/${mode}/html-report`,
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
    command: serverCommand,
    url: `${baseURL}/publication.json`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
