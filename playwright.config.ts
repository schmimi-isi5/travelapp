import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const DESKTOP_SPECS = /(core|offline-ai|map)\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  // One retry on CI only; a test that needed it is reported as "flaky" instead of failing the whole run.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { AI_PROVIDER: 'stub' },
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testMatch: [DESKTOP_SPECS, /a11y\.spec\.ts/] },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: DESKTOP_SPECS },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: DESKTOP_SPECS },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, testMatch: [/mobile\.spec\.ts/, /a11y\.spec\.ts/] },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
