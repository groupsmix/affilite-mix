/**
 * @vitest-environment jsdom
 *
 * Regression tests for the audit-16 Frontend / UX / A11y findings.
 *
 * The audit was taken against commit 58379dac; by current `main` the
 * audit-remediation PRs (#1030–#1033) already addressed most findings.
 * These tests lock in the fixes so they cannot silently regress, and
 * cover the one residual dead-CTA fix made in this change.
 *
 * Findings covered:
 *   #1  Public dark mode — the broken public dark-mode toggle is gone.
 *   #2  Public form fields have accessible labels (newsletter, price-alert).
 *   #3  Price-alert form uses logical (RTL-safe) utilities and derives the
 *       currency symbol from the `currency` prop instead of a hardcoded "$".
 *   #4  Landing framer-motion honours prefers-reduced-motion via MotionConfig.
 *   #6  Comparison table exposes column/row header semantics.
 *   #7  Gift-finder quiz progress is exposed to AT (role=progressbar + aria-live).
 *   #8  Global focus ring uses the dark `--primary` token (contrast on white).
 *   #10 Landing hero CTAs point only at in-page anchors that exist.
 *
 * Components under test are "use client" but access `window`/`document` only
 * inside effects, so `renderToString` (initial render, no effects) is a faithful
 * way to assert the server/first-paint markup — the same strategy used by
 * card-hydration-stability.test.tsx. next/image and next/link are inert-mocked.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { vi } from "vitest";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href?: unknown; children?: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

import { PriceAlertForm } from "@/app/(public)/components/price-alert-form";
import { NewsletterSignup } from "@/app/(public)/components/newsletter-signup";
import { ComparisonTable } from "@/app/(public)/components/comparison-table";
import type { ProductRow } from "@/types/database";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "p1",
    site_id: "site-1",
    name: "Alpha Widget",
    slug: "alpha-widget",
    description: "First widget.",
    affiliate_url: "https://example.com/go/alpha",
    image_url: "",
    image_alt: "",
    price: "$49",
    price_amount: 49,
    price_currency: "USD",
    merchant: "ExampleMart",
    score: 8,
    featured: false,
    status: "active",
    category_id: null,
    cta_text: "View Deal",
    deal_text: "",
    deal_expires_at: null,
    pros: "",
    cons: "",
    version: 1,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── #2: Public form fields have accessible labels ─────────────────────────
describe("#2 public form labels", () => {
  it("price-alert email + target-price inputs each have an associated <label>", () => {
    const html = renderToString(
      <PriceAlertForm productId="p1" productName="Alpha" currentPrice={100} />,
    );
    // Every labelled control resolves via htmlFor -> id.
    expect(html).toContain('for="price-alert-email"');
    expect(html).toContain('id="price-alert-email"');
    expect(html).toContain('for="price-alert-target"');
    expect(html).toContain('id="price-alert-target"');
    // Labels are visually hidden (sr-only), not relying on the placeholder.
    expect(html).toMatch(/class="sr-only"[^>]*>\s*(Email address|Target price)/);
  });

  it("newsletter email input has a non-honeypot associated <label>", () => {
    const html = renderToString(<NewsletterSignup />);
    expect(html).toContain('for="newsletter-email"');
    expect(html).toContain('id="newsletter-email"');
    // The only other label (the honeypot) stays inside an aria-hidden container.
    expect(html).toContain('aria-hidden="true"');
  });
});

// ── #3: RTL-safe utilities + currency derived from prop ───────────────────
describe("#3 price-alert RTL + currency", () => {
  it("uses logical (start/ps/pe) utilities rather than physical left/pl/pr", () => {
    const src = read("app/(public)/components/price-alert-form.tsx");
    expect(src).toMatch(/\bstart-3\b/);
    expect(src).toMatch(/\bps-7\b/);
    expect(src).toMatch(/\bpe-3\b/);
    expect(src).not.toMatch(/\bleft-3\b/);
    expect(src).not.toMatch(/\bpl-7\b/);
  });

  it("renders the currency symbol derived from the currency prop", () => {
    const usd = renderToString(
      <PriceAlertForm productId="p1" productName="Alpha" currentPrice={100} currency="USD" />,
    );
    expect(usd).toContain("$");

    const eur = renderToString(
      <PriceAlertForm productId="p1" productName="Alpha" currentPrice={100} currency="EUR" />,
    );
    expect(eur).toContain("€");
    // The non-USD form must NOT signpost a hardcoded dollar sign.
    expect(eur).not.toContain("$");
  });
});

// ── #6: Comparison table header semantics ─────────────────────────────────
describe("#6 comparison table semantics", () => {
  it("column headers use scope=col and row labels use th scope=row", () => {
    const html = renderToString(
      <ComparisonTable
        products={[makeProduct(), makeProduct({ id: "p2", name: "Beta Widget" })]}
      />,
    );
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    // Row labels (Price/Score/Merchant/Description) are <th>, not <td>.
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>\s*Price/);
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>\s*Merchant/);
  });
});

// ── #7: Gift-finder quiz progress exposed to AT ───────────────────────────
describe("#7 gift-finder quiz accessibility", () => {
  it("progress bar has role=progressbar with value semantics", () => {
    const src = read("app/(public)/gift-finder/gift-finder-quiz.tsx");
    expect(src).toContain('role="progressbar"');
    expect(src).toMatch(/aria-valuenow=/);
    expect(src).toMatch(/aria-valuemax=/);
  });

  it("the active step container announces changes with aria-live=polite", () => {
    const src = read("app/(public)/gift-finder/gift-finder-quiz.tsx");
    expect(src).toContain('aria-live="polite"');
  });
});

// ── #1 / #4 / #8: config-level guarantees ─────────────────────────────────
describe("#1 public dark mode is not a half-broken toggle", () => {
  it("no public dark-mode toggle component exists", () => {
    // The only theme toggle lives under components/admin (out of the public tree).
    expect(() => read("app/(public)/components/dark-mode-toggle.tsx")).toThrow();
  });
});

describe("#4 landing honours prefers-reduced-motion", () => {
  it("LandingMotionConfig wires MotionConfig reducedMotion=user", () => {
    const src = read("app/landing/components/landing-motion-config.tsx");
    expect(src).toMatch(/reducedMotion=["']user["']/);
  });

  it("the landing layout wraps children in LandingMotionConfig", () => {
    const layout = read("app/landing/layout.tsx");
    expect(layout).toContain("LandingMotionConfig");
    expect(layout).toMatch(/<LandingMotionConfig>[\s\S]*children[\s\S]*<\/LandingMotionConfig>/);
  });
});

describe("#8 focus ring uses a high-contrast token", () => {
  it(":focus-visible outline uses --ring, which resolves to the dark --primary", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--ring/);
    // Light-mode --ring is bound to --primary (a dark slate), not a light gray.
    expect(css).toMatch(/--ring:\s*var\(--primary\)/);
  });
});

// ── #10: Landing hero CTAs point only at existing in-page anchors ─────────
describe("#10 landing hero has no dead in-page CTA", () => {
  const SECTION_FILES = [
    "hero",
    "fleet",
    "content-pipeline",
    "click-dashboard",
    "multi-tenant",
    "economics",
    "ship-command",
    "trust",
    "testimonials",
    "pricing",
    "faq",
    "final-cta",
    "footer",
  ].map((n) => `app/landing/sections/${n}.tsx`);

  function collectAnchorIds(): Set<string> {
    const ids = new Set<string>();
    for (const f of SECTION_FILES) {
      const src = read(f);
      for (const m of src.matchAll(/id="([^"]+)"/g)) ids.add(m[1]!);
    }
    return ids;
  }

  function collectHashHrefs(rel: string): string[] {
    const src = read(rel);
    return [...src.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
  }

  it("every in-page hash href in the hero resolves to a real section id", () => {
    const ids = [...collectAnchorIds()];
    const hrefs = collectHashHrefs("app/landing/sections/hero.tsx");
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      expect(ids, `hero links to #${h} but no section defines id="${h}"`).toContain(h);
    }
  });

  it("the removed dead #walkthrough link is gone", () => {
    expect(read("app/landing/sections/hero.tsx")).not.toContain("#walkthrough");
  });
});
