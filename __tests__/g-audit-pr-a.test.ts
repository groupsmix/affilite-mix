/**
 * Regression locks for G-audit PR A.
 *
 * These tests do not exercise runtime behaviour exhaustively — they
 * pin the surface area so a later refactor cannot silently reintroduce
 * one of the findings. Runtime behaviour is covered by the per-module
 * unit tests (e.g. __tests__/csp.test.ts for nonce emission).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { validateAdminUrl, validateAdminUrlFields } from "@/lib/admin-url-guard";
import { buildCspHeader, getCspExternalHosts } from "@/lib/csp";

const ROOT = process.cwd();

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("G-01 — admin URL guard", () => {
  it("rejects http:// by default", () => {
    const r = validateAdminUrl("http://example.com/x.jpg");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/scheme/i);
  });
  it("accepts https:// URLs", () => {
    const r = validateAdminUrl("https://example.com/x.jpg");
    expect(r.valid).toBe(true);
    expect(r.normalized).toMatch(/^https:/);
  });
  it("rejects javascript:", () => {
    const r = validateAdminUrl("javascript:alert(1)");
    expect(r.valid).toBe(false);
  });
  it("rejects data:", () => {
    const r = validateAdminUrl("data:text/html,<script>");
    expect(r.valid).toBe(false);
  });
  it("rejects literal 127.0.0.1", () => {
    const r = validateAdminUrl("https://127.0.0.1/leak");
    expect(r.valid).toBe(false);
  });
  it("rejects AWS metadata endpoint", () => {
    const r = validateAdminUrl("https://169.254.169.254/latest/meta-data");
    expect(r.valid).toBe(false);
  });
  it("rejects IPv6 loopback", () => {
    const r = validateAdminUrl("https://[::1]/");
    expect(r.valid).toBe(false);
  });
  it("rejects IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", () => {
    const r = validateAdminUrl("https://[::ffff:127.0.0.1]/");
    expect(r.valid).toBe(false);
  });
  it("rejects IPv4-mapped IPv6 metadata endpoint (::ffff:169.254.169.254)", () => {
    const r = validateAdminUrl("https://[::ffff:169.254.169.254]/");
    expect(r.valid).toBe(false);
  });
  it("rejects wildcard DNS (nip.io)", () => {
    const r = validateAdminUrl("https://127-0-0-1.nip.io/x");
    expect(r.valid).toBe(false);
  });
  it("rejects rebinding TLD (.internal)", () => {
    const r = validateAdminUrl("https://api.internal/x");
    expect(r.valid).toBe(false);
  });
  it("rejects embedded credentials", () => {
    const r = validateAdminUrl("https://user:pass@example.com/x");
    expect(r.valid).toBe(false);
  });
  it("rejects URLs longer than 2048 chars", () => {
    const long = "https://example.com/" + "a".repeat(2100);
    const r = validateAdminUrl(long);
    expect(r.valid).toBe(false);
  });
  it("treats empty/null/undefined as valid (optional field)", () => {
    expect(validateAdminUrl("").valid).toBe(true);
    expect(validateAdminUrl(null).valid).toBe(true);
    expect(validateAdminUrl(undefined).valid).toBe(true);
  });
  it("validateAdminUrlFields returns first offending field", () => {
    const err = validateAdminUrlFields({
      affiliate_url: "https://example.com",
      image_url: "http://evil.local",
    });
    expect(err).not.toBeNull();
    expect(err?.field).toBe("image_url");
  });
});

describe("G-01 — admin routes wire validateAdminUrl", () => {
  const routes = [
    ["app/api/admin/products/route.ts", ["affiliate_url", "image_url"]],
    ["app/api/admin/products/import/route.ts", ["affiliate_url", "image_url"]],
    ["app/api/admin/sites/route.ts", ["logo_url", "og_image_url"]],
    ["app/api/admin/sites/[id]/route.ts", ["logo_url", "og_image_url"]],
    ["app/api/admin/content/route.ts", ["featured_image", "og_image"]],
  ] as const;

  it.each(routes)("%s imports admin-url-guard", (path) => {
    const src = read(path);
    expect(src).toMatch(/@\/lib\/admin-url-guard/);
  });

  it.each(routes)("%s validates each URL field", (path, fields) => {
    const src = read(path);
    for (const f of fields) {
      // Each URL field must appear in at least one validateAdminUrl*
      // call site in the file. The field literal can come either
      // before (e.g. built into a `urlFields` dict, then passed to
      // validateAdminUrlFields) or after (inline object literal) the
      // call, so we match in both directions within 600 chars.
      const reAfter = new RegExp(`validateAdminUrl(?:Fields)?[\\s\\S]{0,600}\\b${f}\\b`, "m");
      const reBefore = new RegExp(`\\b${f}\\b[\\s\\S]{0,600}validateAdminUrl(?:Fields)?`, "m");
      expect(reAfter.test(src) || reBefore.test(src), `${path} must validate ${f}`).toBe(true);
    }
  });
});

describe("G-02 — dynamic security.txt", () => {
  it("replaces the static placeholder file with a route handler", () => {
    expect(existsSync(join(ROOT, "public/.well-known/security.txt"))).toBe(false);
    expect(existsSync(join(ROOT, "app/.well-known/security.txt/route.ts"))).toBe(true);
  });
  it("route emits Expires: and Canonical: lines", () => {
    const src = read("app/.well-known/security.txt/route.ts");
    expect(src).toMatch(/Expires:/);
    expect(src).toMatch(/Canonical:/);
    expect(src).toMatch(/mailto:/);
    // The emitted document must interpolate real site values — the
    // old static file left literal `[domain]` placeholders in the
    // Contact / Encryption lines.
    expect(src).toMatch(/site\.domain/);
    expect(src).toMatch(/site\.brand\.contactEmail/);
  });
  it("fails closed when site resolution fails", () => {
    const src = read("app/.well-known/security.txt/route.ts");
    expect(src).toContain("status: 404");
    expect(src).toContain("captureException");
    expect(src).not.toContain("groupsmix.com/.well-known/security.txt");
    expect(src).not.toContain("security@groupsmix.com");
  });
});

describe("G-03 / G-04 — CSP + remotePatterns pin to exact hosts when env is set", () => {
  const originalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalR2 = process.env.R2_PUBLIC_URL;

  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    if (originalSupabase === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabase;
    if (originalR2 === undefined) delete process.env.R2_PUBLIC_URL;
    else process.env.R2_PUBLIC_URL = originalR2;
  });

  it("buildCspHeader uses exact Supabase subdomain when NEXT_PUBLIC_SUPABASE_URL is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://odgtwjkzwciohhhqdtti.supabase.co";
    process.env.R2_PUBLIC_URL = "https://cdn.wristnerd.xyz";
    const csp = buildCspHeader("test-nonce");
    expect(csp).toContain("https://odgtwjkzwciohhhqdtti.supabase.co");
    expect(csp).toContain("https://cdn.wristnerd.xyz");
    expect(csp).not.toMatch(/\*\.supabase\.co/);
    expect(csp).not.toMatch(/\*\.r2\.dev/);
  });

  it("getCspExternalHosts returns null (no wildcard fallback) when env is unset", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.R2_PUBLIC_URL;
    const hosts = getCspExternalHosts();
    expect(hosts.supabase).toBeNull();
    expect(hosts.r2).toBeNull();
  });

  it("buildCspHeader never emits a wildcard supabase/r2 source (even when env unset)", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.R2_PUBLIC_URL;
    const csp = buildCspHeader("test-nonce");
    expect(csp).not.toMatch(/\*\.supabase\.co/);
    expect(csp).not.toMatch(/\*\.r2\.dev/);
    expect(csp).not.toMatch(/\*\.r2\.cloudflarestorage\.com/);
  });
});

describe("G-48 — priority={true} is reserved for LCP slots", () => {
  const cinematic = read("app/(public)/components/homepage-cinematic.tsx");
  const minimal = read("app/(public)/components/homepage-minimal.tsx");

  it("homepage-cinematic.tsx does not mark product/content cards priority={true}", () => {
    // Hero is a 90vh text + gradient section with no image — nothing
    // below it is above-the-fold on any realistic viewport.
    expect(cinematic).not.toMatch(/priority=\{i === 0\}/);
    expect(cinematic).toMatch(/priority=\{false\}/);
  });

  it("homepage-minimal.tsx does not mark product/content cards priority={true}", () => {
    expect(minimal).not.toMatch(/priority=\{i === 0\}/);
    expect(minimal).toMatch(/priority=\{false\}/);
  });
});

describe("G-07 — sitemap fail-open", () => {
  const src = read("app/sitemap.ts");
  it("no longer returns an empty array on getCurrentSite failure", () => {
    // The prior code had a bare `return [];` after a logger.warn. We
    // now throw to force a 5xx from Next.
    expect(src).not.toMatch(/return \[\];\s*\n\s*}\s*\n\s*const baseUrl/);
    expect(src).toMatch(/throw err/);
  });
  it("caches last-good responses in KV", () => {
    expect(src).toMatch(/sitemap:last-good:/);
    expect(src).toMatch(/writeLastGoodSitemap/);
    expect(src).toMatch(/readLastGoodSitemap/);
  });
  it("falls back to static pages when cache is empty", () => {
    expect(src).toMatch(/staticFallback/);
    expect(src).toMatch(/sitemapStaticPages/);
  });
});

describe("G-09 — R2 bucket guard reads wrangler.jsonc", () => {
  it("CI workflow queries wrangler.jsonc via jq, not .env.example", () => {
    const ci = read(".github/workflows/ci.yml");
    // The new gate must invoke jq on wrangler.jsonc and no longer
    // grep `^R2_PRIVATE_BUCKET=` against .env.example.
    expect(ci).toContain("wrangler.jsonc");
    expect(ci).toMatch(/jq/);
    // Old grep pattern removed.
    expect(ci).not.toMatch(/^R2_PRIVATE_BUCKET=/m);
  });
  it("validate-cloudflare-bindings.sh uses jq against wrangler.jsonc", () => {
    const sh = read("scripts/validate-cloudflare-bindings.sh");
    expect(sh).toMatch(/jq/);
    expect(sh).toMatch(/wrangler\.jsonc/);
  });
});

describe("G-10 — post-deploy smoke in gradual workflow", () => {
  const y = read(".github/workflows/deploy-gradual.yml");
  it("defines a smoke_host input", () => {
    expect(y).toMatch(/smoke_host/);
  });
  it("curls /, /api/health, /sitemap.xml, /robots.txt, /q7m-k4j9/login", () => {
    expect(y).toMatch(/\/api\/health/);
    expect(y).toMatch(/\/sitemap\.xml/);
    expect(y).toMatch(/\/robots\.txt/);
    expect(y).toMatch(/\/admin\/login/);
  });
});

describe("G-11 — deploy.yml drift gates", () => {
  const d = read(".github/workflows/deploy.yml");
  it("has a Worker bindings drift step", () => {
    expect(d).toMatch(/Runtime drift — Worker bindings/);
    expect(d).toMatch(/\/workers\/scripts\/affilite-mix\/bindings/);
  });
  it("has a Worker secrets drift step", () => {
    expect(d).toMatch(/Runtime drift — Worker secrets/);
    expect(d).toMatch(/\/workers\/scripts\/affilite-mix\/secrets/);
  });
  it("has a cron schedules drift step", () => {
    expect(d).toMatch(/Runtime drift — Cron schedules/);
    expect(d).toMatch(/\/workers\/scripts\/affilite-mix\/schedules/);
  });
});

describe("G-17 — click-tracking failPolicy", () => {
  const src = read("app/api/track/click/route.ts");
  it("is 'closed', not 'open'", () => {
    expect(src).toMatch(/failPolicy:\s*"closed"/);
    expect(src).not.toMatch(/failPolicy:\s*"open"/);
  });
});

describe("G-27 / audit-etap1 #20 — CSP fallback only on middleware-excluded paths", () => {
  const src = read("next.config.ts");
  it("the catch-all /(.*)  rule does NOT declare a Content-Security-Policy header", () => {
    // G-27 (Apr 2026) + audit-etap1 #20 (May 2026): the catch-all CSP
    // fallback was dropped in favour of the per-request nonced policy
    // from middleware.ts. CSP is now ONLY allowed on the narrow source
    // patterns that match middleware-excluded paths (`_next/static`,
    // `_next/image`, `favicon.ico`, `fonts/`, `api/internal/`). The
    // catch-all `/(.*)`  rule must never carry a CSP header.
    expect(src).toMatch(/G-27/);
    const catchAllRule = src.match(/source:\s*"\/\(\.\*\)"[\s\S]*?\}\s*,\s*\]/);
    expect(catchAllRule, "could not find /(.*) headers rule").not.toBeNull();
    expect(catchAllRule![0]).not.toMatch(/"Content-Security-Policy"/);
  });
  it("audit-etap1 #20: middleware-excluded paths carry a `default-src 'none'` fallback CSP", () => {
    expect(src).toMatch(/audit-etap1 #20/);
    expect(src).toMatch(/_next\/static/);
    expect(src).toMatch(/default-src 'none'/);
  });
});
