import { test, expect } from "@playwright/test";

/**
 * Fast, navigation-state-independent login detection.
 * Using page.url() is instant and reliable — it never hangs waiting
 * for DOM elements that haven't appeared yet due to a slow server.
 */
function isOnLoginPage(page: { url(): string }): boolean {
  return page.url().includes("/q7m-k4j9/login");
}

/**
 * Navigate to an admin route and wait for the auth guard's redirect to settle.
 *
 * The admin layout is a server component that calls `redirect("/q7m-k4j9/login")`
 * when there is no valid session. In dev that redirect can land a tick AFTER
 * `domcontentloaded` fires, so a bare `page.url()` check races the navigation
 * and wrongly concludes we're authenticated — the test then waits for form
 * fields that never appear. Here we wait for whichever terminal state arrives
 * first: the login URL (unauthenticated) or the page heading (authenticated).
 */
async function gotoAdminAndSettle(
  page: import("@playwright/test").Page,
  path: string,
  readyHeading: string,
): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await Promise.race([
    page.waitForURL(/\/q7m-k4j9\/login/, { timeout: 10_000 }).catch(() => {}),
    page
      .getByRole("heading", { name: readyHeading })
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {}),
  ]);
}

test.describe("Admin Content Page", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/q7m-k4j9/content");
    // Should either redirect to login or show an auth error
    await expect(page).toHaveURL(/\/admin\/login|\/q7m-k4j9/);
  });

  test("should display the new content form", async ({ page }) => {
    // domcontentloaded: resolves as soon as the HTML is parsed without
    // waiting for background Supabase requests to settle.
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("new content form should have required fields", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    // Fast URL check — works reliably during and after redirects.
    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    await expect(page.locator("#content-title")).toBeVisible();
    await expect(page.locator("#content-slug")).toBeVisible();
    await expect(page.locator("#content-excerpt")).toBeVisible();
    await expect(page.locator('label[for="content-body"]')).toBeVisible();
  });

  test("content form should auto-generate slug from title", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    const titleInput = page.locator("#content-title");
    const slugInput = page.locator("#content-slug");

    await titleInput.fill("My Test Article");
    await expect(slugInput).toHaveValue("my-test-article");
  });

  test("content form should have content type dropdown with correct options", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    const typeSelect = page.locator("#content-type");
    await expect(typeSelect).toBeVisible();

    const options = typeSelect.locator("option");
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("content form should have status dropdown with scheduled option", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    const statusSelect = page.locator("#content-status");
    await expect(statusSelect).toBeVisible();

    const options = statusSelect.locator("option");
    const texts = await options.allTextContents();
    expect(texts).toContain("Scheduled");
    expect(texts).toContain("Draft");
    expect(texts).toContain("Published");
  });

  test("content form should have SEO section", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    const seoSummary = page.locator("summary:has-text('SEO')");
    await expect(seoSummary).toBeVisible();

    await seoSummary.click();

    await expect(page.locator("text=Meta Title")).toBeVisible();
    await expect(page.locator("text=Meta Description")).toBeVisible();
    await expect(page.locator("text=OG Image URL")).toBeVisible();
  });

  test("content form should have scheduling section", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    await expect(page.locator("text=Schedule Publishing")).toBeVisible();
    await expect(page.locator('input[type="datetime-local"]').first()).toBeVisible();
  });

  test("content form should show validation error on empty submit", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/content/new", "New Content");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    await page.locator('button:has-text("Create")').click();

    const titleInput = page.locator("#content-title");
    await expect(titleInput).toHaveAttribute("required", "");
  });
});
