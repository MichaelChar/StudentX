// @ts-check
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFiles } from './e2e/helpers/loadEnv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFiles(__dirname);

const baseURL = (process.env.E2E_BASE_URL || 'http://localhost:3100').replace(
  /\/$/,
  '',
);

/**
 * Playwright e2e for the accommodation marketplace booking flow.
 * Isolated from vitest (`npm run test`). Not wired into CI.
 *
 * @see e2e/README.md
 */
export default defineConfig({
  testDir: path.join(__dirname, 'e2e/specs'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'en-GB',
    timezoneId: 'Europe/Athens',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Prefer system Chrome when Playwright browser binaries are not yet
        // downloaded (common in worktrees). Override with E2E_USE_BUNDLED=1
        // after `npx playwright install chromium`.
        ...(process.env.E2E_USE_BUNDLED
          ? {}
          : { channel: 'chrome' }),
      },
    },
  ],
  // Prefer an already-running server on E2E_BASE_URL (e.g. `npm run dev -- -p 3100`).
  // Set E2E_SKIP_WEBSERVER=1 to never spawn one.
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev -- -p 3100',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        env: {
          ...process.env,
          PORT: '3100',
        },
      },
});
