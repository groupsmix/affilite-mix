/**
 * Tests for lib/csp.ts — nonce generation and CSP header assembly (H-10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildCspHeader, generateCspNonce, NONCE_HEADER } from "@/lib/csp";

describe("generateCspNonce", () => {
  it("returns a non-empty base64 string", () => {
    const nonce = generateCspNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(nonce.length).toBeGreaterThan(0);
  });

  it("is unique across invocations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(generateCspNonce());
    }
    // With 128 bits of entropy a collision in 100 samples is effectively 0.
    expect(seen.size).toBe(100);
  });

  it("carries at least 128 bits of entropy (>= 22 base64 chars)", () => {
    const nonce = generateCspNonce();
    // 16 bytes → base64 w/ padding = 24 chars.
    expect(nonce.length).toBeGreaterThanOrEqual(22);
  });
});

describe("buildCspHeader", () => {
  const nonce = "test-nonce-abc123";
  // A8-05: Build header inside beforeEach to avoid module-load env leakage.
  let header: string;

  beforeEach(() => {
    header = buildCspHeader(nonce);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("embeds the nonce in script-src", () => {
    expect(header).toContain(`script-src 'self' 'nonce-${nonce}'`);
  });

  it("allows unsafe-inline in style-src (nonce removed — see lib/csp.ts rationale)", () => {
    expect(header).toContain("style-src 'self' 'unsafe-inline'");
    // Nonce is NOT used for style-src; see csp.ts comment for why.
    expect(header).not.toMatch(/style-src[^;]*nonce/);
  });

  it("keeps 'strict-dynamic' on script-src", () => {
    expect(header).toMatch(/script-src[^;]*'strict-dynamic'/);
  });

  it("does not include 'unsafe-inline' in script-src (A-011: nonce-only for scripts)", () => {
    expect(header).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("preserves previously configured third-party sources", () => {
    expect(header).toContain("https://challenges.cloudflare.com");
    // G-03 (Apr 2026 audit): the Supabase source is now an exact
    // hostname derived from NEXT_PUBLIC_SUPABASE_URL rather than the
    // `*.supabase.co` wildcard. Tests don't set that env var by
    // default, so the build falls back to a placeholder host — we
    // just assert the Supabase project host appears somewhere in the
    // connect-src directive.
    expect(header).toMatch(/connect-src[^;]*supabase/);
    // F-10: Sentry connect-src is now an exact host derived from
    // NEXT_PUBLIC_SENTRY_DSN. When no DSN is set (as in tests), Sentry
    // is omitted entirely — no wildcard fallback.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
      expect(header).toMatch(/connect-src[^;]*https:\/\/[^\s;]*?\.ingest\.sentry\.io/);
    } else {
      expect(header).not.toMatch(
        /connect-src[^;]*https:\/\/[^\s;]*?\.ingest\.sentry\.io(?:[\/;]|$)/,
      );
    }
  });

  it("keeps hardened baseline directives", () => {
    expect(header).toContain("object-src 'none'");
    expect(header).toContain("base-uri 'self'");
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain("upgrade-insecure-requests");
  });

  it("does not leak the nonce across multiple invocations", () => {
    const other = buildCspHeader("different-nonce");
    expect(other).toContain("'nonce-different-nonce'");
    expect(other).not.toContain("'nonce-test-nonce-abc123'");
  });

  // A8-04: malformed DSN test
  it("omits sentry from CSP when DSN is malformed", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "not-a-url");
    const h = buildCspHeader("test-nonce");
    expect(h).not.toMatch(/sentry\.io/);
  });

  // A8-04: valid DSN test
  it("includes exact sentry host when DSN is valid", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
    const h = buildCspHeader("test-nonce");
    expect(h).toMatch(/connect-src[^;]*https:\/\/o1\.ingest\.sentry\.io/);
  });
});

describe("NONCE_HEADER constant", () => {
  it("matches the Next.js-recommended header name", () => {
    expect(NONCE_HEADER).toBe("x-nonce");
  });
});
