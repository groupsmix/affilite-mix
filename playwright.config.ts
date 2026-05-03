import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // F-A87-01: Retries mask flaky tests. Keep retries at 1 (down from 2) so
  // genuine regressions surface faster. Treat any retry as a P2 follow-up
  // to fix the underlying flake, not a permanent workaround.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  // F-A87-01: Bail out early when too many tests fail -- avoids burning CI
  // minutes on a clearly broken build.
  maxFailures: process.env.CI ? 5 : undefined,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Desktop browsers
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    // Mobile / tablet form-factors. Catches viewport-specific regressions
    // (mobile menu, responsive grids, touch targets) that desktop browsers
    // miss. Use the Playwright-curated device descriptors so the user-agent,
    // viewport, device-scale-factor and touch settings stay accurate.
    {
      name: "Pixel 5",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "iPad Mini",
      use: { ...devices["iPad Mini"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
