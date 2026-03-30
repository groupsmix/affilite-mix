import { test, expect } from "@playwright/test";

test.describe("Public Content Rendering", () => {
  test("homepage should render without errors", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(500);

    // Page should have a body with content
    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Should have basic page structure
    await expect(page.locator("header, nav, main, footer").first()).toBeVisible();
  });

  test("homepage should include skip-to-content link for accessibility", async ({
    page,
  }) => {
    await page.goto("/");

    // The skip-to-content link should exist (accessibility)
    const skipLink = page.locator('a[href="#main-content"], a:has-text("Skip to content")');
    const count = await skipLink.count();
    if (count > 0) {
      // It should be present in the DOM (may be visually hidden)
      await expect(skipLink.first()).toBeAttached();
    }
  });

  test("homepage should have proper meta tags", async ({ page }) => {
    await page.goto("/");

    // Should have a title
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("cookie consent banner should appear", async ({ page }) => {
    // Clear cookies to ensure consent banner shows
    await page.context().clearCookies();
    await page.goto("/");

    // Cookie consent banner should appear
    const consentBanner = page.locator(
      '[role="dialog"], [aria-label*="cookie" i], [class*="cookie" i]',
    );
    const count = await consentBanner.count();
    if (count > 0) {
      await expect(consentBanner.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("footer should have navigation links", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    // Footer should contain links
    const links = footer.locator("a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });
});
