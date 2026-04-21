/**
 * E2E: Admin Site Manager delete dialog + static-config gate (15c.6)
 *
 * Covers:
 *   1. Delete confirmation input gate on DB-managed sites:
 *      empty → disabled, wrong slug → disabled, correct slug → enabled.
 *   2. Static-config sites: delete entry is disabled and exposes an
 *      explanatory tooltip when hovered.
 *   3. Deactivated DB-managed sites: the UI reflects the `is_active: false`
 *      state via the dropdown toggle label. The scenario is driven entirely
 *      by Playwright route-mocking, so no live database is required.
 *
 * Auth: the admin guard is a server component. We mint a JWT with the
 * documented dev-only fallback secret and set it as the admin session
 * cookie. Against a local `next dev` server that is the real secret, so
 * the guard lets us through. Against a production-deployed preview (CI),
 * the secret won't match and the page redirects to /admin/login — in
 * that case the tests skip rather than fail (consistent with the other
 * admin specs in this repo).
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { SignJWT } from "jose";

/** Must match `DEV_ONLY_JWT_SECRET` in lib/jwt-secret.ts */
const DEV_ONLY_JWT_SECRET = "__dev_only_insecure_jwt_secret__";
const ADMIN_COOKIE = "nh_admin_token";

/**
 * Mint a valid admin JWT using whatever secret the running dev server is
 * likely to use. Falls back to the documented dev secret when not set.
 */
async function signAdminToken(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? DEV_ONLY_JWT_SECRET);
  return new SignJWT({ email: "e2e-admin@example.com", userId: "e2e-admin", role: "super_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setAudience("affiliate-platform")
    .setIssuer("affiliate-platform")
    .sign(secret);
}

async function authenticateAdmin(context: BrowserContext, baseURL: string): Promise<void> {
  const token = await signAdminToken();
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: ADMIN_COOKIE,
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

interface MockSite {
  id: string;
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: string;
  is_active?: boolean;
  source: "database" | "config";
  db_id?: string;
  theme: Record<string, unknown>;
  features?: Record<string, boolean>;
  monetization_type?: string;
}

const DB_SITE: MockSite = {
  id: "db-tenant",
  slug: "db-tenant",
  name: "DB Tenant",
  domain: "db-tenant.example.com",
  language: "en",
  direction: "ltr",
  is_active: true,
  source: "database",
  db_id: "00000000-0000-0000-0000-000000000001",
  theme: { primaryColor: "#1f2937" },
  features: {},
  monetization_type: "affiliate",
};

const DEACTIVATED_SITE: MockSite = {
  ...DB_SITE,
  id: "deactivated-tenant",
  slug: "deactivated-tenant",
  name: "Deactivated Tenant",
  domain: "deactivated-tenant.example.com",
  is_active: false,
  db_id: "00000000-0000-0000-0000-000000000002",
};

const STATIC_SITE: MockSite = {
  id: "static-tenant",
  slug: "static-tenant",
  name: "Static Tenant",
  domain: "static-tenant.example.com",
  language: "en",
  direction: "ltr",
  source: "config",
  theme: { primaryColor: "#0ea5e9" },
  monetization_type: "affiliate",
};

/**
 * Install Playwright route-mocks for every admin-sites endpoint the
 * SiteManager component touches on mount. Keeps the test hermetic — no
 * DB reads, no network to Supabase.
 */
async function mockAdminSitesApis(page: Page, sites: MockSite[]): Promise<void> {
  await page.route("**/api/admin/sites", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sites }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/admin/sites/active", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ activeSiteId: null }),
    });
  });
  await page.route("**/api/admin/sites/stats*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        period: { days: 7, since: new Date().toISOString() },
        stats: {},
      }),
    });
  });
}

/**
 * True when the guard bounced us to the login page because the minted JWT
 * didn't match the server's signing secret (e.g. running against a
 * production preview worker). Tests that depend on rendering the site
 * manager should skip in that case.
 */
async function isLoginPage(page: Page): Promise<boolean> {
  if (/\/admin\/login/.test(page.url())) return true;
  return page
    .locator("text=Admin Login")
    .isVisible()
    .catch(() => false);
}

test.describe("Admin Site Manager — delete dialog + static gate (15c.6)", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await authenticateAdmin(context, baseURL ?? "http://localhost:3000");
  });

  test("delete confirmation button is gated by the site slug", async ({ page }) => {
    await mockAdminSitesApis(page, [DB_SITE]);
    await page.goto("/admin/sites");
    if (await isLoginPage(page))
      test.skip(true, "Admin guard rejected the test JWT; skipping UI assertions.");

    // Open the per-card actions menu.
    await page.getByRole("button", { name: `Actions for ${DB_SITE.name}` }).click();
    // Triggering the Delete menu item opens the AlertDialog.
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading")).toHaveText(`Delete ${DB_SITE.name}?`);

    const confirmInput = dialog.getByLabel("Type the site slug to confirm");
    const deleteBtn = dialog.getByRole("button", { name: "Delete site" });

    // (a) Empty input → disabled
    await expect(confirmInput).toHaveValue("");
    await expect(deleteBtn).toBeDisabled();

    // (b) Wrong slug → still disabled
    await confirmInput.fill("not-the-slug");
    await expect(deleteBtn).toBeDisabled();

    // (c) Correct slug → enabled
    await confirmInput.fill(DB_SITE.slug);
    await expect(deleteBtn).toBeEnabled();

    // Clearing the input should disable the button again.
    await confirmInput.fill("");
    await expect(deleteBtn).toBeDisabled();
  });

  test("static-config sites expose a disabled delete entry with tooltip", async ({ page }) => {
    await mockAdminSitesApis(page, [STATIC_SITE]);
    await page.goto("/admin/sites");
    if (await isLoginPage(page))
      test.skip(true, "Admin guard rejected the test JWT; skipping UI assertions.");

    await page.getByRole("button", { name: `Actions for ${STATIC_SITE.name}` }).click();

    const deleteItem = page.getByRole("menuitem", { name: "Delete" });
    await expect(deleteItem).toBeVisible();
    // Radix marks disabled menuitems via data-disabled / aria-disabled.
    await expect(deleteItem).toHaveAttribute("aria-disabled", "true");

    // The tooltip is wired to the wrapper <div> around the disabled item;
    // hovering surfaces the explanatory copy.
    await deleteItem.hover();
    await expect(
      page.getByText("Static-config sites cannot be deleted from the admin UI."),
    ).toBeVisible();
  });

  test("deactivated DB site surfaces an Activate toggle (no live DB)", async ({ page }) => {
    await mockAdminSitesApis(page, [DEACTIVATED_SITE]);
    await page.goto("/admin/sites");
    if (await isLoginPage(page))
      test.skip(true, "Admin guard rejected the test JWT; skipping UI assertions.");

    await page.getByRole("button", { name: `Actions for ${DEACTIVATED_SITE.name}` }).click();

    // Deactivated tenants surface the "Activate" action; active tenants
    // would instead show "Deactivate".
    await expect(page.getByRole("menuitem", { name: "Activate" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Deactivate" })).toHaveCount(0);

    // The destructive Delete entry is still available for DB-managed rows
    // regardless of activation state.
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  });
});
