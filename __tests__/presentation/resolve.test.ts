/**
 * Precedence + independence tests for resolvePresentation and the independent
 * header/footer variant resolvers.
 */
import { describe, it, expect } from "vitest";
import { resolvePresentation } from "@/lib/presentation/resolve";
import { resolveHeaderVariant, resolveFooterVariant } from "@/lib/layout-variant";

describe("resolveHeaderVariant / resolveFooterVariant (independence)", () => {
  it("resolves header and footer independently", () => {
    expect(
      resolveHeaderVariant({ dbHeaderVariant: "magazine", dbFooterVariant: "minimal" } as never),
    ).toBe("magazine");
    expect(resolveFooterVariant({ dbFooterVariant: "minimal" })).toBe("minimal");
  });

  it("falls back through DB layout -> config header -> config layout -> standard", () => {
    expect(resolveHeaderVariant({ dbLayoutVariant: "compare" })).toBe("compare");
    expect(resolveHeaderVariant({ configHeaderVariant: "directory" })).toBe("directory");
    expect(resolveHeaderVariant({ configLayoutVariant: "minimal" })).toBe("minimal");
    expect(resolveHeaderVariant({})).toBe("standard");
  });

  it("ignores unrecognized variant strings", () => {
    expect(resolveHeaderVariant({ dbHeaderVariant: "hacker" })).toBe("standard");
  });
});

describe("resolvePresentation", () => {
  it("uses safe defaults when there is no DB record", () => {
    const p = resolvePresentation({}, null);
    expect(p.headerVariant).toBe("standard");
    expect(p.footerVariant).toBe("standard");
    expect(p.header).toBeDefined();
    expect(p.headerTokens.appearance).toBeDefined();
  });

  it("lets the header change without changing the footer", () => {
    const p = resolvePresentation({}, { headerVariant: "magazine" });
    expect(p.headerVariant).toBe("magazine");
    expect(p.footerVariant).toBe("standard");
  });

  it("layers DB config over config over variant defaults", () => {
    const p = resolvePresentation(
      { headerConfig: { ctaLabel: "Config CTA", showCta: true } },
      { headerConfig: { ctaLabel: "DB CTA" }, headerVariant: "compare" },
    );
    expect(p.headerVariant).toBe("compare");
    // DB wins on the field it sets...
    expect(p.header.ctaLabel).toBe("DB CTA");
    // ...config still supplies fields the DB omitted.
    expect(p.header.showCta).toBe(true);
  });

  it("degrades a malformed DB record to defaults rather than throwing", () => {
    const p = resolvePresentation(
      {},
      {
        headerVariant: "not-real",
        headerConfig: "garbage",
        headerTokens: { background: "url(evil)" },
      },
    );
    expect(p.headerVariant).toBe("standard");
    expect(p.headerTokens.background).toBeNull();
  });
});
