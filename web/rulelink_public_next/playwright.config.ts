import {defineConfig, devices} from '@playwright/test';

const mode = process.env.RULELINK_AUTHORITY_TEST_MODE ?? 'browser';
const fixturePort = Number(process.env.RULELINK_AUTHORITY_FIXTURE_PORT ?? '8891');
const fixtureBaseUrl = `http://127.0.0.1:${fixturePort}`;
const releaseBaseUrl = process.env.RULELINK_AUTHORITY_RELEASE_BASE_URL;
const outputRoot = `test-results/authority-024/${mode}`;

export default defineConfig({
  testDir: './e2e/authority',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: `${outputRoot}/artifacts`,
  reporter: [
    ['list'],
    ['./e2e/authority/support/evidence-reporter.ts', {
      outputFile: mode === 'release'
        ? 'test-results/authority-024/authority-release-evidence.json'
        : 'test-results/authority-024/authority-browser-evidence.json',
    }],
    ['html', {
      open: 'never',
      outputFolder: `${outputRoot}/html-report`,
    }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: mode === 'release'
      ? (releaseBaseUrl ?? 'http://127.0.0.1:9')
      : fixtureBaseUrl,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: mode === 'release'
    ? undefined
    : {
        command: `node e2e/authority/support/start-fixture-build.mjs --port ${fixturePort}`,
        url: `${fixtureBaseUrl}/publication.json`,
        reuseExistingServer: false,
        timeout: 300_000,
      },
});
