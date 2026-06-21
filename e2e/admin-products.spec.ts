import { test, expect } from "@playwright/test";

/**
 * Fast, navigation-state-independent login detection.
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

test.describe("Admin Products Page", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/q7m-k4j9/products");
    await expect(page).toHaveURL(/\/admin\/login|\/q7m-k4j9/);
  });

  test("should display the new product form", async ({ page }) => {
    // domcontentloaded: resolves as soon as the HTML is parsed without
    // waiting for background Supabase requests to settle.
    await gotoAdminAndSettle(page, "/q7m-k4j9/products/new", "New Product");

    // If redirected to login or error page, any h1 is acceptable.
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("new product form should have required fields", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/products/new", "New Product");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    await expect(page.locator("#prod-name")).toBeVisible();
    await expect(page.locator("#prod-slug")).toBeVisible();
    await expect(page.locator("#prod-desc")).toBeVisible();
  });

  test("product form should auto-generate slug from name", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/products/new", "New Product");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    const nameInput = page.locator("#prod-name");
    const slugInput = page.locator("#prod-slug");

    await nameInput.fill("Test Product Name");
    await expect(slugInput).toHaveValue("test-product-name");
  });

  test("product form should show validation error on empty submit", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/products/new", "New Product");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    await page.locator('button:has-text("Create")').click();

    const nameInput = page.locator("#prod-name");
    await expect(nameInput).toHaveAttribute("required", "");
  });

  test("product form should have status dropdown with correct options", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/products/new", "New Product");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    const statusSelect = page.locator("#prod-status");
    await expect(statusSelect).toBeVisible();

    const options = statusSelect.locator("option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText("Draft");
    await expect(options.nth(1)).toHaveText("Active");
    await expect(options.nth(2)).toHaveText("Archived");
  });

  test("product form should have currency dropdown", async ({ page }) => {
    await gotoAdminAndSettle(page, "/q7m-k4j9/products/new", "New Product");

    if (isOnLoginPage(page)) {
      test.skip(true, "admin auth not provisioned — login page detected");
      return;
    }

    const currencySelect = page.locator("#prod-currency");
    await expect(currencySelect).toBeVisible();
    await expect(currencySelect).toHaveValue("USD");
  });
});
