/**
 * Validation tests for the presentation config resolvers. Untrusted DB/config
 * JSON must always narrow to safe, bounded values — no CSS injection, no
 * unbounded strings/arrays, no unsafe URLs.
 */
import { describe, it, expect } from "vitest";
import {
  isSafeCssToken,
  resolveHeaderConfig,
  resolveFooterConfig,
  resolveHeaderTokens,
} from "@/lib/presentation/header-config";
import { DEFAULT_HEADER_CONFIG, DEFAULT_HEADER_TOKENS } from "@/config/presentation";

describe("resolveHeaderConfig", () => {
  it("returns the base for non-object input", () => {
    expect(resolveHeaderConfig(null)).toEqual(DEFAULT_HEADER_CONFIG);
    expect(resolveHeaderConfig("nope")).toEqual(DEFAULT_HEADER_CONFIG);
    expect(resolveHeaderConfig(42)).toEqual(DEFAULT_HEADER_CONFIG);
  });

  it("accepts valid enum values and rejects invalid ones", () => {
    expect(resolveHeaderConfig({ logoMode: "image" }).logoMode).toBe("image");
    expect(resolveHeaderConfig({ logoMode: "wat" }).logoMode).toBe(DEFAULT_HEADER_CONFIG.logoMode);
    expect(resolveHeaderConfig({ navAlignment: "center" }).navAlignment).toBe("center");
    expect(resolveHeaderConfig({ navAlignment: "diagonal" }).navAlignment).toBe(
      DEFAULT_HEADER_CONFIG.navAlignment,
    );
  });

  it("caps overlong text fields", () => {
    const long = "x".repeat(500);
    const cfg = resolveHeaderConfig({ ctaLabel: long, announcement: { text: long } });
    expect(cfg.ctaLabel.length).toBeLessThanOrEqual(120);
    expect(cfg.announcement.text.length).toBeLessThanOrEqual(200);
  });

  it("rejects unsafe hrefs but keeps http(s) + internal paths", () => {
    expect(resolveHeaderConfig({ ctaHref: "javascript:alert(1)" }).ctaHref).toBe(
      DEFAULT_HEADER_CONFIG.ctaHref,
    );
    expect(resolveHeaderConfig({ ctaHref: "https://x.com/go" }).ctaHref).toBe("https://x.com/go");
    expect(resolveHeaderConfig({ ctaHref: "/pricing" }).ctaHref).toBe("/pricing");
  });

  it("bounds the category strip to 12 valid items and drops malformed ones", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, href: "/x" }));
    items.push({ label: "bad", href: "javascript:x" } as never);
    items.push({ label: "", href: "/y" } as never);
    const strip = resolveHeaderConfig({ categoryStrip: { enabled: true, items } }).categoryStrip;
    expect(strip.enabled).toBe(true);
    expect(strip.items.length).toBeLessThanOrEqual(12);
    expect(strip.items.every((i) => i.label && i.href.startsWith("/"))).toBe(true);
  });

  it("layers DB overrides on top of a provided base without touching other fields", () => {
    const base = resolveHeaderConfig({ showCta: true, ctaLabel: "Buy" });
    const merged = resolveHeaderConfig({ sticky: false }, base);
    expect(merged.showCta).toBe(true);
    expect(merged.ctaLabel).toBe("Buy");
    expect(merged.sticky).toBe(false);
  });
});

describe("resolveFooterConfig", () => {
  it("validates fields and falls back for junk", () => {
    expect(resolveFooterConfig({ showNewsletter: false }).showNewsletter).toBe(false);
    expect(resolveFooterConfig({ containerWidth: "huge" }).containerWidth).toBe("standard");
  });
});

describe("isSafeCssToken", () => {
  it("accepts hex, rgb/hsl, plain lengths and font names", () => {
    expect(isSafeCssToken("#1e293b")).toBe(true);
    expect(isSafeCssToken("rgb(30, 41, 59)")).toBe(true);
    expect(isSafeCssToken("hsla(210, 50%, 20%, 0.5)")).toBe(true);
    expect(isSafeCssToken("64px")).toBe(true);
    expect(isSafeCssToken("Inter")).toBe(true);
  });

  it("rejects every CSS-injection vector", () => {
    expect(isSafeCssToken("url(x)")).toBe(false);
    expect(isSafeCssToken("expression(alert(1))")).toBe(false);
    expect(isSafeCssToken("var(--x)")).toBe(false);
    expect(isSafeCssToken("red;} body{display:none")).toBe(false);
    expect(isSafeCssToken("</style>")).toBe(false);
    expect(isSafeCssToken("x".repeat(200))).toBe(false);
    expect(isSafeCssToken(42)).toBe(false);
  });
});

describe("resolveHeaderTokens", () => {
  it("keeps safe tokens and nulls unsafe ones", () => {
    const t = resolveHeaderTokens({
      background: "#000000",
      accent: "url(evil)",
      height: "72px",
      appearance: "light",
    });
    expect(t.background).toBe("#000000");
    expect(t.accent).toBeNull();
    expect(t.height).toBe("72px");
    expect(t.appearance).toBe("light");
  });

  it("returns base for non-object input", () => {
    expect(resolveHeaderTokens(undefined)).toEqual(DEFAULT_HEADER_TOKENS);
  });
});
