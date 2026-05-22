import { defineConfig, devices } from "@playwright/test";

// F-03: In CI, fail fast if E2E_BASE_URL is not configured. E2E depends on a
// deployed preview target; running against a non-existent localhost wastes CI time.
if (process.env.CI && !process.env.E2E_BASE_URL) {
  throw new Error(
    "E2E_BASE_URL is required in CI. Set it to a preview deployment URL or disable E2E in this workflow.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  // Create missing screenshot baselines on first run instead of failing.
  // Reviewers can approve the committed snapshots on the resulting PR.
  updateSnapshots: "missing",
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
