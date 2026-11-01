import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'chrome-stable', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge-stable', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-safari-engine', use: { ...devices['Desktop Safari'] } },
    { name: 'android-chrome-emulation', use: { ...devices['Pixel 7'] } },
    { name: 'ios-safari-emulation', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
