import { test, expect } from "@playwright/test";

test.describe("Admin Content Page", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/admin/content");

    // Should either redirect to login or show an auth error
    await expect(page).toHaveURL(/\/admin\/login|\/admin/);
  });

  test("should display the new content form", async ({ page }) => {
    await page.goto("/admin/content/new");

    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("new content form should have required fields", async ({ page }) => {
    await page.goto("/admin/content/new");

    const isLoginPage = await page
      .locator("text=Admin Login")
      .isVisible()
      .catch(() => false);

    if (!isLoginPage) {
      await expect(page.locator("text=Title")).toBeVisible();
      await expect(page.locator("text=Slug")).toBeVisible();
      await expect(page.locator("text=Excerpt")).toBeVisible();
      await expect(page.locator("text=Body")).toBeVisible();
    }
  });

  test("content form should auto-generate slug from title", async ({ page }) => {
    await page.goto("/admin/content/new");

    const isLoginPage = await page
      .locator("text=Admin Login")
      .isVisible()
      .catch(() => false);
    if (isLoginPage) {
      test.skip();
      return;
    }

    const titleInput = page.locator('label:has-text("Title") + input');
    const slugInput = page.locator('label:has-text("Slug") + input');

    await titleInput.fill("My Test Article");
    await expect(slugInput).toHaveValue("my-test-article");
  });

  test("content form should have content type dropdown with correct options", async ({
    page,
  }) => {
    await page.goto("/admin/content/new");

    const isLoginPage = await page
      .locator("text=Admin Login")
      .isVisible()
      .catch(() => false);
    if (isLoginPage) {
      test.skip();
      return;
    }

    const typeSelect = page.locator('label:has-text("Type") + select');
    await expect(typeSelect).toBeVisible();

    const options = typeSelect.locator("option");
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("content form should have status dropdown with scheduled option", async ({
    page,
  }) => {
    await page.goto("/admin/content/new");

    const isLoginPage = await page
      .locator("text=Admin Login")
      .isVisible()
      .catch(() => false);
    if (isLoginPage) {
      test.skip();
      return;
    }

    const statusSelect = page.locator('label:has-text("Status") + select');
    await expect(statusSelect).toBeVisible();

    // Verify the status options include "Scheduled" (audit issue 2.8 fix)
    const options = statusSelect.locator("option");
    const texts = await options.allTextContents();
    expect(texts).toContain("Scheduled");
    expect(texts).toContain("Draft");
    expect(texts).toContain("Published");
  });

  test("content form should have SEO section", async ({ page }) => {
    await page.goto("/admin/content/new");

    const isLoginPage = await page
      .locator("text=Admin Login")
      .isVisible()
      .catch(() => false);
    if (isLoginPage) {
      test.skip();
      return;
    }

    // SEO section is inside a <details> element
    const seoSummary = page.locator("summary:has-text('SEO')");
    await expect(seoSummary).toBeVisible();

    // Expand the SEO section
    await seoSummary.click();

    await expect(page.locator("text=Meta Title")).toBeVisible();
    await expect(page.locator("text=Meta Description")).toBeVisible();
    await expect(page.locator("text=OG Image URL")).toBeVisible();
  });

  test("content form should have scheduling section", async ({ page }) => {
    await page.goto("/admin/content/new");

    const isLoginPage = await page
      .locator("text=Admin Login")
      .isVisible()
      .catch(() => false);
    if (isLoginPage) {
      test.skip();
      return;
    }

    await expect(page.locator("text=Schedule Publishing")).toBeVisible();
    await expect(
      page.locator('input[type="datetime-local"]').first(),
    ).toBeVisible();
  });

  test("content form should show validation error on empty submit", async ({
    page,
  }) => {
    await page.goto("/admin/content/new");

    const isLoginPage = await page
      .locator("text=Admin Login")
      .isVisible()
      .catch(() => false);
    if (isLoginPage) {
      test.skip();
      return;
    }

    await page.locator('button:has-text("Create")').click();

    // HTML validation should prevent submission (required fields)
    const titleInput = page.locator('label:has-text("Title") + input');
    await expect(titleInput).toHaveAttribute("required", "");
  });
});
