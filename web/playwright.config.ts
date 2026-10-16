import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the real stack: the Go server (built from ../server) serving
// PocketBase and /api/lort, supervising this app's standalone build, on a throwaway data dir.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:4052',
    trace: 'retain-on-failure',
    // Set PW_CHROMIUM to use an installed Chromium instead of Playwright's download.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
  ],
  webServer: {
    command: 'sh e2e/start.sh',
    url: 'http://localhost:4052/api/lort/health',
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
});
