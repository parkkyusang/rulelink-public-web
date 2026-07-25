import {defineConfig} from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  retries: 0,
  testDir: './e2e/launch-pilot',
  use: {
    baseURL: 'http://127.0.0.1:18940',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next build e2e/launch-pilot/fixture && node node_modules/next/dist/bin/next start e2e/launch-pilot/fixture -p 18940 -H 127.0.0.1',
    reuseExistingServer: false,
    timeout: 180_000,
    url: 'http://127.0.0.1:18940',
  },
  workers: 1,
});
