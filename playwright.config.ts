import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:3100',
  },
  webServer: {
    command: 'npm run start -- -p 3100',
    port: 3100,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
});
