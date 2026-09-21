import { defineConfig, devices } from '@playwright/test';

const port = 4183;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './test',
  testMatch: /.*\.e2e\.js/,
  timeout: 60_000,
  // One worker: with two, the shared dev server was observed dying mid-suite
  // under swiftshader memory pressure in constrained environments.
  workers: 1,
  retries: 2,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 15 Pro Max'], browserName: 'chromium' } }
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
