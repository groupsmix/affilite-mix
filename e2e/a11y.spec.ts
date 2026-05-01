import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility (a11y) tests using axe-core via Playwright.
 *
 * These tests catch WCAG 2.1 AA violations on key pages.
 * Run with:  npm run test:a11y
 */

/** Shared axe configuration — excludes known third-party widgets. */
function buildAxe(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".turnstile-widget"); // Cloudflare Turnstile iframe
}

/**
 * Helper: run axe and assert zero violations.
 * Formats violations into a readable failure message.
 */
async function expectNoViolations(page: Page) {
  const results = await buildAxe(page).analyze();

  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
  }));

  expect(
    violations,
    `Accessibility violations found:\n${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

test.describe("Accessibility (axe-core)", () => {
  test("homepage has no a11y violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page);
  });

  test("search page has no a11y violations", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page);
  });

  test("contact page has no a11y violations", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page);
  });

  test("privacy page has no a11y violations", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page);
  });

  test("admin login page has no a11y violations", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page);
  });
});

test.describe("RTL Support and Visual Regression (ar-SA)", () => {
  // Override the locale to Arabic for this test suite
  test.use({ locale: "ar-SA" });

  test("homepage visually renders correctly in RTL", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enforce a11y checks on the RTL version
    await expectNoViolations(page);

    // Visual regression test to ensure RTL layout doesn't break
    await expect(page).toHaveScreenshot("homepage-rtl.png", { fullPage: true });
  });
});
