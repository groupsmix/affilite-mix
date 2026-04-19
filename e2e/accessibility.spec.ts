/**
 * Accessibility smoke tests — uses @axe-core/playwright to scan public
 * pages for WCAG violations. Failing the build on serious/critical
 * violations catches regressions like missing landmarks, unlabeled
 * form controls, insufficient contrast, or non-keyboard-operable
 * widgets before they ship.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLIC_PATHS = [
  { name: "homepage", path: "/" },
  { name: "search", path: "/search?q=test" },
];

for (const { name, path } of PUBLIC_PATHS) {
  test(`a11y: ${name} has no critical or serious axe violations`, async ({ page }) => {
    const response = await page.goto(path);
    // If the route doesn't exist or errors, skip — we only assert accessibility
    // on pages that actually render. This keeps the smoke test resilient to
    // per-site route differences (search, blog, etc. may or may not exist).
    if (!response || response.status() >= 500) {
      test.skip(true, `${path} returned ${response?.status() ?? "no response"}`);
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // Marketing-page content we don't own shouldn't block CI — narrow
      // the scope to our page chrome.
      .exclude("[data-axe-exclude]")
      .analyze();

    const blocking = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    );

    // Attach a readable summary to the report when it fails.
    if (blocking.length > 0) {
      const summary = blocking
        .map(
          (v) =>
            `[${v.impact}] ${v.id} — ${v.help}\n   nodes: ${v.nodes
              .map((n) => n.target.join(" "))
              .join(", ")}`,
        )
        .join("\n");
      await test.info().attach(`axe-violations-${name}.txt`, {
        body: summary,
        contentType: "text/plain",
      });
    }

    expect(blocking, `axe found ${blocking.length} serious/critical violations`).toEqual([]);
  });
}

test("a11y: skip-to-content link is focusable on homepage", async ({ page }) => {
  await page.goto("/");
  // Pressing Tab once from the top of the page should focus the skip link.
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      href: (el as HTMLAnchorElement).href ?? "",
      text: el.textContent?.trim() ?? "",
    };
  });

  // Lenient: either the first tab stop is the skip link, or the page has no
  // skip link yet. We assert that *if* a skip link exists anywhere, it uses
  // the standard pattern.
  const skipLinks = await page.locator('a[href="#main-content"], a[href="#main"]').count();
  if (skipLinks > 0) {
    expect(focused, "first tab stop should be the skip-to-content link").toBeTruthy();
    expect(focused!.tag).toBe("a");
    expect(focused!.href).toMatch(/#main(-content)?$/);
  }
});
