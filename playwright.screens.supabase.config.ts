import { defineConfig, devices } from '@playwright/test';

/** Screenshots of the production (Supabase) mode against the local full stack; see docs/IMPLEMENTATION_REPORT.md. */
export default defineConfig({
  testDir: 'tests/screens-supabase',
  timeout: 400_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.APP_URL ?? 'http://localhost:18080' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
