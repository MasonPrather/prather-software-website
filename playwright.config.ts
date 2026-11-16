import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4321', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'mobile',
      use: { browserName: 'chromium', viewport: { width: 375, height: 812 } },
    },
    {
      name: 'tablet',
      use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit', viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: [
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4321 --ignore-lock',
      url: 'http://127.0.0.1:4321',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'node scripts/contact-preview.mjs',
      url: 'http://127.0.0.1:4322/contact/',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
