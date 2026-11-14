import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // E2E_PROD=1 tests the output of `npm run build` instead of the dev server.
    command: `${process.env.E2E_PROD ? 'NODE_ENV=production ' : ''}PORT=${PORT} npx tsx server.ts`,
    url: `http://localhost:${PORT}/healthz`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
