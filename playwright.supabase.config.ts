import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the full local stack: the app container (supabase mode) + self-hosted Supabase.
 * Prerequisites: `npm run stack:up` and `bash scripts/stack.sh app-up` (app on http://localhost:18080).
 */
export default defineConfig({
  testDir: 'tests/e2e-supabase',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-supabase.json' }]],
  use: { baseURL: process.env.APP_URL ?? 'http://localhost:18080', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
