import base from './playwright.config';
import { defineConfig } from '@playwright/test';

// Timing runs, kept out of the normal suite: npx playwright test -c playwright.perf.config.ts
export default defineConfig({
  ...base,
  testDir: 'tests/perf',
  testMatch: '**/*.perf.ts',
  retries: 0,
  timeout: 60 * 60_000,
});
