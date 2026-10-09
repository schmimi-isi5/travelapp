import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/** Separate config so `npm run test:e2e` stays fast; run with `npm run screenshots` after a build. */
export default defineConfig({
  testDir: 'tests/screens',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: false, env: { AI_PROVIDER: 'stub' } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
