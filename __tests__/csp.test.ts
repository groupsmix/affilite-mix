/**
 * Tests for lib/csp.ts — nonce generation and CSP header assembly (H-10).
 */
import { describe, it, expect } from "vitest";
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
  const header = buildCspHeader(nonce);

  it("embeds the nonce in script-src", () => {
    expect(header).toContain(`script-src 'self' 'nonce-${nonce}'`);
  });

  it("embeds the nonce in style-src", () => {
    expect(header).toContain(`style-src 'self' 'nonce-${nonce}'`);
  });

  it("keeps 'strict-dynamic' on script-src", () => {
    expect(header).toMatch(/script-src[^;]*'strict-dynamic'/);
  });

  it("retains 'unsafe-inline' fallback (CSP Level-3 browsers ignore it when a nonce is present)", () => {
    expect(header).toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(header).toMatch(/style-src[^;]*'unsafe-inline'/);
  });

  it("preserves previously configured third-party sources", () => {
    expect(header).toContain("https://challenges.cloudflare.com");
    expect(header).toContain("https://*.supabase.co");
    expect(header).toContain("https://*.ingest.sentry.io");
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
});

describe("NONCE_HEADER constant", () => {
  it("matches the Next.js-recommended header name", () => {
    expect(NONCE_HEADER).toBe("x-nonce");
  });
});
