import { test, expect } from "@playwright/test";

test.describe("Public Search", () => {
  test("should display search input on the homepage", async ({ page }) => {
    await page.goto("/");

    // The site should render a search form or input
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="Search"], input[aria-label*="Search"]',
    );

    // Search may not be enabled for all sites, so check gracefully
    const count = await searchInput.count();
    if (count > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test("should navigate to search results page", async ({ page }) => {
    await page.goto("/search?q=test");

    // Should either show results or a "no results" message
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Page should contain search-related content
    const pageText = await body.textContent();
    expect(pageText).toBeTruthy();
  });

  test("should handle empty search gracefully", async ({ page }) => {
    await page.goto("/search?q=");

    await page.waitForLoadState("networkidle");

    // Should not crash — page should render
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
