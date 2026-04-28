import { test, expect } from "@playwright/test";

/**
 * F-UI-01: Homepage variant E2E coverage
 *
 * The homepage forks into 3 templates based on site.homepageTemplate:
 *   - "minimal"   → ai-compared (clean, AI-focused)
 *   - "standard"  → arabic-tools, crypto-tools (traditional listing)
 *   - "cinematic" → watch-tools (hero video/image, immersive)
 *
 * These tests verify each template renders without errors and has the
 * expected structural elements.
 */

interface HomepageVariant {
  id: string;
  template: "minimal" | "standard" | "cinematic";
  host: string;
  direction: "ltr" | "rtl";
  expectedElements: string[];
}

const HOMEPAGE_VARIANTS: readonly HomepageVariant[] = [
  {
    id: "ai-compared",
    template: "minimal",
    host: "ai.localhost",
    direction: "ltr",
    expectedElements: ["main", "h1", "[data-testid='product-grid']"],
  },
  {
    id: "arabic-tools",
    template: "standard",
    host: "arabic.localhost",
    direction: "rtl",
    expectedElements: ["main", "h1", "[data-testid='content-list']"],
  },
  {
    id: "crypto-tools",
    template: "standard",
    host: "crypto.localhost",
    direction: "ltr",
    expectedElements: ["main", "h1", "[data-testid='content-list']"],
  },
  {
    id: "watch-tools",
    template: "cinematic",
    host: "watch.localhost",
    direction: "ltr",
    expectedElements: ["main", "[data-testid='hero-section']", "[data-testid='product-showcase']"],
  },
];

const E2E_BASE_URL = process.env.E2E_BASE_URL;
const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

/**
 * Build the test URL for a given host.
 * In local dev, use the .localhost alias directly.
 * In preview deploy (E2E_BASE_URL set), skip non-default sites.
 */
function getTestUrl(host: string): string | null {
  if (E2E_BASE_URL) {
    // Preview deploy: only default site works
    const defaultSite = process.env.NEXT_PUBLIC_DEFAULT_SITE || "ai-compared";
    const siteId = host.replace(".localhost", "");
    if (siteId !== defaultSite && !host.includes(defaultSite)) {
      return null; // Skip this site in preview mode
    }
    return E2E_BASE_URL;
  }
  // Local dev: use the .localhost alias
  return `http://${host}:${PORT}`;
}

test.describe("F-UI-01: Homepage template variants", () => {
  for (const variant of HOMEPAGE_VARIANTS) {
    const testUrl = getTestUrl(variant.host);

    if (!testUrl) {
      test.skip(`Skipping ${variant.id} (${variant.template}) in preview mode`, () => {});
      continue;
    }

    test.describe(`${variant.id} (${variant.template} template)`, () => {
      test.beforeEach(async ({ page }) => {
        // Set the host header by navigating to the full URL
        await page.goto(testUrl);
      });

      test("renders without console errors", async ({ page }) => {
        const consoleErrors: string[] = [];
        const consoleWarnings: string[] = [];

        page.on("console", (msg) => {
          if (msg.type() === "error") {
            consoleErrors.push(msg.text());
          } else if (msg.type() === "warning") {
            consoleWarnings.push(msg.text());
          }
        });

        await page.goto(testUrl);
        await page.waitForLoadState("networkidle");

        // No critical errors allowed
        const criticalErrors = consoleErrors.filter(
          (e) => !e.includes("favicon") && !e.includes("robots.txt")
        );
        expect(criticalErrors, `Console errors on ${variant.id}`).toHaveLength(0);
      });

      test("has correct text direction", async ({ page }) => {
        await page.goto(testUrl);
        const dir = await page.locator("html").getAttribute("dir");
        expect(dir).toBe(variant.direction);
      });

      test("contains expected structural elements", async ({ page }) => {
        await page.goto(testUrl);

        for (const selector of variant.expectedElements) {
          const element = page.locator(selector).first();
          await expect(element, `${selector} should exist on ${variant.id}`).toBeVisible();
        }
      });

      test("has working navigation", async ({ page }) => {
        await page.goto(testUrl);

        // Verify skip-to-content link exists (accessibility)
        const skipLink = page.locator('a[href="#main-content"]').first();
        await expect(skipLink, "Skip to content link should exist").toBeVisible();

        // Main content area should exist
        const mainContent = page.locator("main, [role='main'], #main-content").first();
        await expect(mainContent, "Main content area should exist").toBeVisible();
      });

      test("CSP does not block inline styles", async ({ page }) => {
        // This catches F-CD-02 style-src-attr issues
        const cspViolations: string[] = [];

        page.on("console", (msg) => {
          const text = msg.text();
          if (text.includes("Content Security Policy") || text.includes("CSP")) {
            cspViolations.push(text);
          }
        });

        await page.goto(testUrl);
        await page.waitForLoadState("networkidle");

        // Only allow font-related CSP issues (common false positives)
        const realViolations = cspViolations.filter(
          (v) => !v.includes("font") && !v.includes("favicon")
        );

        expect(realViolations, `CSP violations on ${variant.id}`).toHaveLength(0);
      });

      if (variant.template === "cinematic") {
        test("cinematic: hero section is prominent", async ({ page }) => {
          await page.goto(testUrl);

          // Hero should take significant viewport
          const hero = page.locator("[data-testid='hero-section']").first();
          await expect(hero).toBeVisible();

          const box = await hero.boundingBox();
          expect(box?.height, "Hero should be at least 50% viewport height").toBeGreaterThan(400);
        });
      }

      if (variant.template === "minimal") {
        test("minimal: clean layout without excessive elements", async ({ page }) => {
          await page.goto(testUrl);

          // Should have product grid but minimal chrome
          const productGrid = page.locator("[data-testid='product-grid']").first();
          await expect(productGrid).toBeVisible();

          // No hero section in minimal
          const hero = page.locator("[data-testid='hero-section']");
          await expect(hero).toHaveCount(0);
        });
      }
    });
  }
});

test.describe("F-UI-01: Cross-variant common checks", () => {
  test("all sites have valid HTML structure", async ({ browser }) => {
    for (const variant of HOMEPAGE_VARIANTS) {
      const testUrl = getTestUrl(variant.host);
      if (!testUrl) continue;

      const page = await browser.newPage();
      await page.goto(testUrl);

      // Verify doctype and basic structure
      const doctype = await page.evaluate(() => document.doctype?.name);
      expect(doctype, `${variant.id}: should have HTML5 doctype`).toBe("html");

      // Verify lang attribute
      const lang = await page.locator("html").getAttribute("lang");
      expect(lang, `${variant.id}: should have lang attribute`).toBeTruthy();

      await page.close();
    }
  });

  test("all sites load without 500 errors", async ({ browser }) => {
    for (const variant of HOMEPAGE_VARIANTS) {
      const testUrl = getTestUrl(variant.host);
      if (!testUrl) continue;

      const page = await browser.newPage();
      const response = await page.goto(testUrl);

      expect(
        response?.status(),
        `${variant.id}: should return 200, not ${response?.status()}`
      ).toBe(200);

      await page.close();
    }
  });
});
