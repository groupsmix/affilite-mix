import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("fallback hardening", () => {
  it("omits robots sitemap when no domain resolves", () => {
    const src = read("app/robots.ts");
    expect(src).toContain("domain ? { sitemap:");
    expect(src).toContain("captureException");
    expect(src).not.toContain("allSites[0]");
    expect(src).not.toContain("DEFAULT_DOMAIN");
  });

  it("omits the landing canonical when no configured origin resolves", () => {
    const src = read("app/landing/layout.tsx");
    expect(src).toContain("process.env.SITE_URL || process.env.APP_URL");
    expect(src).not.toContain("https://affilite-mix.com");
  });

  it("does not select a first site during production builds", () => {
    const src = read("lib/site-context.ts");
    expect(src).toContain("NEXT_PUBLIC_DEFAULT_SITE");
    expect(src).not.toContain("Build-time fallback");
    expect(src).not.toContain("allSites[0]");
  });
});
