import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const authFile = path.resolve(process.cwd(), '.runtime/e2e-owner.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'auth-setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'authenticated-phone', testMatch: /authenticated-journeys\.spec\.ts/, dependencies: ['auth-setup'], use: { ...devices['iPhone 13'], storageState: authFile } },
    { name: 'authenticated-tablet', testMatch: /authenticated-journeys\.spec\.ts/, dependencies: ['auth-setup'], use: { ...devices['iPad (gen 7)'], storageState: authFile } },
    { name: 'authenticated-desktop', testMatch: /authenticated-journeys\.spec\.ts/, dependencies: ['auth-setup'], use: { ...devices['Desktop Chrome'], storageState: authFile } },
    { name: 'public-phone', testIgnore: [/authenticated-journeys\.spec\.ts/, /auth\.setup\.ts/], use: { ...devices['iPhone 13'] } },
    { name: 'public-tablet', testIgnore: [/authenticated-journeys\.spec\.ts/, /auth\.setup\.ts/], use: { ...devices['iPad (gen 7)'] } },
    { name: 'public-desktop', testIgnore: [/authenticated-journeys\.spec\.ts/, /auth\.setup\.ts/], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === 'true' ? undefined : {
    command: 'pnpm start',
    url: `${baseURL}/api/health/liveness`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
