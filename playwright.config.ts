import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test-e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
  },
});
