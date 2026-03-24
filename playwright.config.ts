import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test-e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
  },
});
