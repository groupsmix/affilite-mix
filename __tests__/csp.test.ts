/**
 * Tests for lib/csp.ts — nonce generation and CSP header assembly
 * (H-10 + A-11 audit hardening).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  buildCspHeader,
  cspHeaderName,
  generateCspNonce,
  isCspReportOnly,
  NONCE_HEADER,
} from "@/lib/csp";

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

  // A-11: 'unsafe-inline' has been dropped from both directives. CSP
  // Level-3 browsers ignored it whenever a nonce was present anyway, but
  // keeping it left a Level-2 escape hatch open for older engines.
  it("does NOT include 'unsafe-inline' in script-src (A-11)", () => {
    expect(header).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("does NOT include 'unsafe-inline' in style-src (A-11)", () => {
    expect(header).not.toMatch(/style-src[^;]*'unsafe-inline'/);
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

  it("retains the violation collector via report-uri", () => {
    expect(header).toContain("report-uri /api/csp-report");
  });

  it("does not leak the nonce across multiple invocations", () => {
    const other = buildCspHeader("different-nonce");
    expect(other).toContain("'nonce-different-nonce'");
    expect(other).not.toContain("'nonce-test-nonce-abc123'");
  });
});

describe("isCspReportOnly / cspHeaderName (A-11 rollout toggle)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to report-only when CSP_REPORT_ONLY is unset", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "");
    // A blank string is treated as "set but empty" — our helper still
    // explicitly checks `=== undefined`, which the stub respects.
    vi.unstubAllEnvs();
    expect(isCspReportOnly()).toBe(true);
    expect(cspHeaderName()).toBe("Content-Security-Policy-Report-Only");
  });

  it("flips to enforcing mode when CSP_REPORT_ONLY=false", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "false");
    expect(isCspReportOnly()).toBe(false);
    expect(cspHeaderName()).toBe("Content-Security-Policy");
  });

  it("treats common falsy spellings as enforcing", () => {
    for (const v of ["0", "off", "no", "FALSE", "  False  "]) {
      vi.stubEnv("CSP_REPORT_ONLY", v);
      expect(isCspReportOnly()).toBe(false);
      expect(cspHeaderName()).toBe("Content-Security-Policy");
    }
  });

  it("any other value keeps the policy in report-only mode", () => {
    for (const v of ["true", "1", "yes", "anything"]) {
      vi.stubEnv("CSP_REPORT_ONLY", v);
      expect(isCspReportOnly()).toBe(true);
      expect(cspHeaderName()).toBe("Content-Security-Policy-Report-Only");
    }
  });
});

describe("NONCE_HEADER constant", () => {
  it("matches the Next.js-recommended header name", () => {
    expect(NONCE_HEADER).toBe("x-nonce");
  });
});
