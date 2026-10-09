import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Integration tests against a real local Supabase stack (see scripts/stack.sh). Run: npm run test:backend */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/backend/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
