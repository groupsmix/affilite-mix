import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { currencySymbol } from "@/app/(public)/components/price-alert-form";

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
}

describe("frontend audit regressions", () => {
  it.each([
    ["USD", "$"],
    ["EUR", "€"],
    ["GBP", "£"],
  ])("renders the narrow symbol for %s", (currency, symbol) => {
    expect(currencySymbol(currency)).toBe(symbol);
  });

  it("does not advertise a missing landing walkthrough", () => {
    const hero = source("app/landing/sections/hero.tsx");

    expect(hero).not.toContain('href="#walkthrough"');
    expect(hero).not.toContain("Watch a 90-second walkthrough");
  });

  it("keeps both price-alert fields programmatically labelled", () => {
    const form = source("app/(public)/components/price-alert-form.tsx");

    expect(form).toContain('htmlFor="price-alert-email"');
    expect(form).toContain('id="price-alert-email"');
    expect(form).toContain('htmlFor="price-alert-target"');
    expect(form).toContain('id="price-alert-target"');
  });

  it("uses logical price-alert spacing for RTL layouts", () => {
    const form = source("app/(public)/components/price-alert-form.tsx");

    expect(form).toContain("start-3");
    expect(form).toContain("ps-7");
    expect(form).toContain("pe-3");
  });

  it("keeps the newsletter email field labelled", () => {
    const form = source("app/(public)/components/newsletter-signup.tsx");

    expect(form).toContain('htmlFor="newsletter-email"');
    expect(form).toContain('id="newsletter-email"');
  });

  it("keeps comparison table headers scoped", () => {
    const table = source("app/(public)/components/comparison-table.tsx");

    expect(table).toContain('scope="col"');
    expect(table).toContain('scope="row"');
  });

  it("announces gift-finder progress and step changes", () => {
    const quiz = source("app/(public)/gift-finder/gift-finder-quiz.tsx");

    expect(quiz).toContain('role="progressbar"');
    expect(quiz).toContain("aria-valuenow=");
    expect(quiz).toContain('aria-live="polite"');
  });

  it("honours reduced-motion preferences on the landing page", () => {
    const motionConfig = source("app/landing/components/landing-motion-config.tsx");

    expect(motionConfig).toContain('reducedMotion="user"');
  });
});
