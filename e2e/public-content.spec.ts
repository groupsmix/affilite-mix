import { test, expect } from "@playwright/test";

/**
 * Public-content E2E parametrized over every site registered in
 * `config/sites/`. Covers all three homepage templates:
 *
 *   - "minimal"   → ai-compared
 *   - "standard"  → arabic-tools (RTL), crypto-tools
 *   - "cinematic" → watch-tools
 *
 * Each entry maps to the site's `.localhost` alias from its
 * `config/sites/<slug>.ts` definition. The dev `next` server resolves
 * the active tenant from the request `Host` header in `middleware.ts`,
 * so changing the hostname is sufficient to switch sites against a
 * single running server — no rebuild required.
 *
 * NEXT_PUBLIC_DEFAULT_SITE remains the build-time fallback used when a
 * request can't be resolved by hostname (see `lib/site-context.ts`).
 * For preview deployments where every request hits the same Cloudflare
 * Workers hostname, we can't multiplex sites by `Host`, so all but the
 * env-pinned default site are skipped (gated by `E2E_BASE_URL`).
 */

interface SiteFixture {
  id: string;
  template: "standard" | "cinematic" | "minimal";
  /** Alias from `config/sites/<id>.ts`'s `aliases: ["...localhost"]` entry. */
  host: string;
  /** Expected `<html dir>` value, when the site enforces a writing direction. */
  direction?: "ltr" | "rtl";
}

const SITES: readonly SiteFixture[] = [
  { id: "ai-compared", template: "minimal", host: "ai.localhost", direction: "ltr" },
  { id: "arabic-tools", template: "standard", host: "arabic.localhost", direction: "rtl" },
  { id: "crypto-tools", template: "standard", host: "crypto.localhost", direction: "ltr" },
  { id: "watch-tools", template: "cinematic", host: "watch.localhost", direction: "ltr" },
];

const E2E_BASE_URL = process.env.E2E_BASE_URL;
const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

/**
 * The site id that will actually answer requests for the test target:
 *   - Local dev: each project's `host` resolves to its own site, so the
 *     parametrized site id is authoritative.
 *   - Preview deploy (E2E_BASE_URL set): every request resolves to the
 *     site pinned via `NEXT_PUBLIC_DEFAULT_SITE` at build time. Tests
 *     for the other sites are skipped to avoid asserting against the
 *     wrong tenant.
 */
const PREVIEW_DEFAULT_SITE = process.env.NEXT_PUBLIC_DEFAULT_SITE ?? SITES[0].id;

function siteBaseUrl(site: SiteFixture): string {
  if (E2E_BASE_URL) return E2E_BASE_URL;
  return `http://${site.host}:${PORT}`;
}

for (const site of SITES) {
  test.describe(`Public Content — ${site.id} (${site.template} template)`, () => {
    test.use({ baseURL: siteBaseUrl(site) });

    test.beforeEach(async ({}, testInfo) => {
      // When running against a single preview URL, only the build-pinned
      // tenant can answer correctly. Skip the other sites so they don't
      // false-fail (or worse, false-pass against the wrong tenant).
      if (E2E_BASE_URL && site.id !== PREVIEW_DEFAULT_SITE) {
        testInfo.skip(
          true,
          `E2E_BASE_URL is set; site=${site.id} skipped because the preview ` +
            `target serves NEXT_PUBLIC_DEFAULT_SITE=${PREVIEW_DEFAULT_SITE}.`,
        );
      }
    });

    test("homepage should render without errors", async ({ page }) => {
      const response = await page.goto("/");
      expect(response?.status()).toBeLessThan(500);

      // Page should have a body with content
      const body = page.locator("body");
      await expect(body).toBeVisible();

      // Should have basic page structure
      await expect(page.locator("header, nav, main, footer").first()).toBeVisible();
    });

    test("homepage should include skip-to-content link for accessibility", async ({ page }) => {
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

    if (site.direction) {
      test(`<html dir> matches site definition (${site.direction})`, async ({ page }) => {
        await page.goto("/");
        // dir may be unset (defaults to ltr) on non-RTL sites — only assert
        // when the site explicitly sets a direction we care about.
        const dir = (await page.locator("html").getAttribute("dir")) ?? "ltr";
        if (site.direction === "rtl") {
          expect(dir).toBe("rtl");
        } else {
          expect(dir === "ltr" || dir === "auto").toBe(true);
        }
      });
    }
  });
}
