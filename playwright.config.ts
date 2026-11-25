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
    // Runs the first run's shortcut once: a browser that has seen it, saved for the rest.
    { name: 'setup', testMatch: /onboard\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'e2e/.state/onboarded.json',
      },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: {
        viewport: { width: 390, height: 844 },
        storageState: 'e2e/.state/onboarded.json',
      },
    },
  ],
});
