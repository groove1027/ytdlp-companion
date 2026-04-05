import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test-e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        '--disable-features=PrivateNetworkAccessForNavigationRequests,BlockInsecurePrivateNetworkRequests',
        '--disable-web-security',
      ],
    },
    screenshot: 'off',
    video: 'off',
  },
});
