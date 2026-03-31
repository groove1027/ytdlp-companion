import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test-e2e',
  timeout: 60000,
  retries: 0,
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
  },
});
