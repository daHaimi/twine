import { defineConfig, devices } from '@playwright/test'

// Playwright e2e configuration.
//
// Runs against a headless Chromium instance (container-friendly, no GUI
// dependency) per PROJECT-PROMPT.md's NFR for frontend tests. Desktop and
// mobile (touch-emulating) projects both run the same spec suite so that
// gesture-based interactions (swipe to turn/twist) are validated on a
// touch-capable viewport as well as a classic mouse/keyboard desktop one.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
