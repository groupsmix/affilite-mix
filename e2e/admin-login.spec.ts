import { test, expect, type Page } from "@playwright/test";
import { SignJWT } from "jose";

/**
 * Mint a valid admin JWT using the same secret and claims the local dev
 * server expects. audience/issuer MUST match lib/auth.ts verifyToken().
 */
async function mintAdminJwt(): Promise<string> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET must be set for E2E tests");
  const secret = new TextEncoder().encode(jwtSecret);
  return new SignJWT({ email: "e2e-admin@example.com", userId: "e2e-admin", role: "super_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setAudience("affilite-mix-admin")
    .setIssuer("affilite-mix-auth")
    .sign(secret);
}

/**
 * Mock GET /api/auth/csrf so fetchWithCsrf() works in tests.
 * Every test that submits a form must call this first.
 */
async function mockCsrf(page: Page): Promise<void> {
  await page.route("**/api/auth/csrf", async (route) => {
    await route.fulfill({ status: 200, json: { csrfToken: "test-csrf-token-e2e" } });
  });
}

/**
 * Wait for React to finish hydrating the login page.
 * The login page sets data-e2e-hydrated="1" on <body> inside a useEffect,
 * which only fires after React's client-side hydration is complete.
 * This is the only reliable hydration indicator for React 19, which no longer
 * attaches __reactFiber$ keys to DOM elements.
 */
async function waitForReactHydration(page: Page): Promise<void> {
  await page.waitForSelector('body[data-e2e-hydrated="1"]', { timeout: 15_000 });
}

test.describe("Admin Login Page", () => {
  test("should display the login form", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");
    // In dev mode the h1 renders "Admin Login DEV" (env badge span), so use
    // toContainText not toHaveText for the exact title.
    await expect(page.locator("h1")).toContainText("Admin Login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText("Sign in");
  });

  test("should show error for missing password", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");

    await page.locator('input[type="email"]').fill("admin@example.com");
    await page.locator('button[type="submit"]').click();

    // password input has "required" attribute — native validation blocks submit
    await expect(page.locator('input[type="password"]')).toHaveAttribute("required", "");
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");
    // Ensure React is hydrated so form submit calls handleSubmit, not native form.
    await waitForReactHydration(page);

    // Mock CSRF before any form interaction.
    await mockCsrf(page);
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({ status: 401, json: { error: "Invalid credentials" } });
    });

    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();

    const errorBanner = page.locator(".bg-red-50");
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText(/invalid|failed|error/i);
  });

  test("should show 'Signing in...' while submitting", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");
    await waitForReactHydration(page);

    // Mock CSRF so the fetch pipeline is fully mocked — no real server round-trip.
    await mockCsrf(page);
    // Delay the login response by 2 s so the loading state is visible.
    await page.route("**/api/auth/login", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ status: 401, json: { error: "Invalid credentials" } });
    });

    await page.locator('input[type="email"]').fill("test@example.com");
    await page.locator('input[type="password"]').fill("testpassword");
    await page.locator('button[type="submit"]').click();

    // Button must show "Signing in..." during the 2 s window.
    await expect(page.locator('button[type="submit"]')).toHaveText("Signing in...", {
      timeout: 5_000,
    });
  });

  test("should open forgot password modal", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");
    await waitForReactHydration(page);

    await page.locator("text=Forgot your password?").click();

    // The cookie consent banner also renders role="dialog", so use the
    // ARIA name to target specifically the forgot password modal.
    const dialog = page.getByRole("dialog", { name: "Reset Password" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.locator("h3")).toHaveText("Reset Password");
    await expect(dialog.locator('input[type="email"]')).toBeVisible();
    await expect(dialog.locator("text=Send Reset Link")).toBeVisible();
  });

  test("should close forgot password modal on cancel", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");
    await waitForReactHydration(page);

    await page.locator("text=Forgot your password?").click();
    const dialog = page.getByRole("dialog", { name: "Reset Password" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator("text=Cancel").click();
    await expect(dialog).not.toBeVisible();
  });

  test("should submit forgot password form", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");
    await waitForReactHydration(page);

    // Mock CSRF (forgot-password form also calls fetchWithCsrf).
    await mockCsrf(page);
    await page.route("**/api/auth/forgot-password", async (route) => {
      await route.fulfill({ status: 200, json: { ok: true } });
    });

    await page.locator("text=Forgot your password?").click();
    const dialog = page.getByRole("dialog", { name: "Reset Password" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator('input[type="email"]').fill("admin@example.com");
    await dialog.locator("text=Send Reset Link").click();

    await expect(dialog.locator("text=If an account with that email exists")).toBeVisible({
      timeout: 5_000,
    });
    await expect(dialog.locator("text=Back to Login")).toBeVisible();
  });

  test("should redirect to dashboard on successful login", async ({ page }) => {
    await page.goto("/q7m-k4j9/login");
    await waitForReactHydration(page);

    await mockCsrf(page);

    // Real signed JWT so the server-side admin guard accepts the cookie.
    const token = await mintAdminJwt();
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        json: { ok: true },
        headers: {
          "Set-Cookie": `nh_admin_token=${token}; Path=/; HttpOnly`,
        },
      });
    });

    await page.route("**/api/admin/sites/active", async (route) => {
      await route.fulfill({ status: 200, json: { activeSiteId: "site-1" } });
    });

    await page.locator('input[type="email"]').fill("admin@example.com");
    await page.locator('input[type="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    // The client sets window.location.href = "/q7m-k4j9" after getting an
    // active site. Use "commit" (first response byte) so the test doesn't
    // wait for the dashboard page to finish its slow Supabase queries.
    await page.waitForURL("**/q7m-k4j9", {
      timeout: 15_000,
      waitUntil: "commit",
    });
  });
});
