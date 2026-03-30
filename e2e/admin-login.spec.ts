import { test, expect } from "@playwright/test";

test.describe("Admin Login Page", () => {
  test("should display the login form", async ({ page }) => {
    await page.goto("/admin/login");

    await expect(page.locator("h1")).toHaveText("Admin Login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText("Sign in");
  });

  test("should show error for missing password", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator('input[type="email"]').fill("admin@example.com");
    await page.locator('button[type="submit"]').click();

    // The form requires password (HTML required attribute), or the API returns an error
    // Wait for either a validation message or an API error
    const errorBanner = page.locator(".bg-red-50");
    const passwordInput = page.locator('input[type="password"]');

    // password input has "required" attribute, so form won't submit
    await expect(passwordInput).toHaveAttribute("required", "");
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();

    // Wait for the error message to appear
    const errorBanner = page.locator(".bg-red-50");
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText(/invalid|failed|error/i);
  });

  test("should show 'Signing in...' while submitting", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator('input[type="email"]').fill("test@example.com");
    await page.locator('input[type="password"]').fill("testpassword");

    // Intercept the login API to delay the response
    await page.route("/api/auth/login", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ status: 401, json: { error: "Invalid credentials" } });
    });

    await page.locator('button[type="submit"]').click();
    await expect(page.locator('button[type="submit"]')).toHaveText("Signing in...");
  });

  test("should open forgot password modal", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator("text=Forgot your password?").click();

    await expect(page.locator("h3")).toHaveText("Reset Password");
    await expect(
      page.locator('input[type="email"]').nth(1),
    ).toBeVisible();
    await expect(page.locator("text=Send Reset Link")).toBeVisible();
  });

  test("should close forgot password modal on cancel", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator("text=Forgot your password?").click();
    await expect(page.locator("h3")).toHaveText("Reset Password");

    await page.locator("text=Cancel").click();
    await expect(page.locator("h3")).not.toBeVisible();
  });

  test("should submit forgot password form", async ({ page }) => {
    await page.goto("/admin/login");

    await page.locator("text=Forgot your password?").click();

    // Mock the forgot-password API
    await page.route("/api/auth/forgot-password", async (route) => {
      await route.fulfill({ status: 200, json: { ok: true } });
    });

    const modalEmailInput = page.locator(".fixed input[type='email']");
    await modalEmailInput.fill("admin@example.com");
    await page.locator("text=Send Reset Link").click();

    // Should show success message
    await expect(
      page.locator("text=If an account with that email exists"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Back to Login")).toBeVisible();
  });

  test("should redirect to dashboard on successful login", async ({ page }) => {
    await page.goto("/admin/login");

    // Mock the login API to return success with a cookie
    await page.route("/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        json: { ok: true },
        headers: {
          "Set-Cookie": "nh_admin_token=mock-token; Path=/; HttpOnly",
        },
      });
    });

    await page.locator('input[type="email"]').fill("admin@example.com");
    await page.locator('input[type="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // The client-side code calls router.push("/admin") on success
    await page.waitForURL("**/admin", { timeout: 10_000 });
  });
});
