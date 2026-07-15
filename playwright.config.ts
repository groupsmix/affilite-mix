import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// F-03: In CI, fail fast if E2E_BASE_URL is not configured. E2E depends on a
// deployed preview target; running against a non-existent localhost wastes CI time.
if (process.env.CI && !process.env.E2E_BASE_URL) {
  throw new Error(
    "E2E_BASE_URL is required in CI. Set it to a preview deployment URL or disable E2E in this workflow.",
  );
}

// In CI, run only Chromium by default for fast PR feedback (~10 min).
// Set E2E_FULL_SUITE=true for cross-browser + mobile testing (nightly).
const fullSuite = !process.env.CI || process.env.E2E_FULL_SUITE === "true";

const allProjects = [
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
];

const ciProjects = [allProjects[0]]; // Chromium only for PR CI

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: Number.isNaN(Number(process.env.PLAYWRIGHT_RETRIES))
    ? process.env.CI
      ? 0
      : 0
    : Number(process.env.PLAYWRIGHT_RETRIES),
  workers: process.env.CI ? 2 : undefined,
  // In CI also emit a machine-readable JSON report so the E2E execution &
  // skip-honesty gate (scripts/ci/e2e-gate.sh) can enforce a minimum executed
  // count and an allow-list for skips. Locally, the HTML report is friendlier.
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: "playwright-report/results.json" }]]
    : "html",
  // Create missing screenshot baselines on first run instead of failing.
  // Reviewers can approve the committed snapshots on the resulting PR.
  updateSnapshots: "missing",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    // Pre-accepted cookie consent so the banner doesn't steal focus
    // or overlay content during tests. Tests that need the banner
    // (e.g. cookie-consent) call context.clearCookies() first.
    storageState: path.join(__dirname, "e2e", ".auth", "storage-state.json"),
    // Bypass CSP in local dev: webpack's eval-source-map (used by Next.js
    // dev mode) is blocked by the app's strict `script-src` policy, which
    // prevents React from hydrating and makes all interaction tests fail.
    // This flag is safe for E2E tests because we are testing functionality,
    // not the CSP policy itself. It is intentionally not set in CI, where
    // tests run against a production-built deployment that doesn't use eval.
    bypassCSP: !process.env.CI,
  },
  projects: (fullSuite ? allProjects : ciProjects).filter(
    (p): p is NonNullable<typeof p> => p !== undefined,
  ),
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
