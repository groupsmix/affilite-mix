/**
 * F-006: image optimizer hardening posture.
 *
 * Regression guard for the Next image config while it still proxies
 * third-party (Amazon) product images. Asserts the controls that bound the
 * SSRF + bandwidth-amplification surface stay in place:
 *   - SVG optimisation stays off (SVGs can carry script)
 *   - direct /_next/image navigation downloads rather than renders inline
 *   - the quality axis is pinned (no ?q=1..100 re-optimisation fan-out)
 *   - a long minimumCacheTTL bounds upstream re-fetch on the width axis
 *   - remotePatterns never ship a wildcard host
 */
import { describe, it, expect } from "vitest";
import nextConfig from "@/next.config";

describe("F-006: Next image optimizer hardening", () => {
  it("never optimises remote SVGs", () => {
    expect(nextConfig.images?.dangerouslyAllowSVG).toBe(false);
  });

  it("forces attachment disposition so direct navigation cannot be sniffed into a document", () => {
    expect(nextConfig.images?.contentDispositionType).toBe("attachment");
  });

  it("pins the quality axis to bound re-optimisation fan-out", () => {
    expect(nextConfig.images?.qualities).toEqual([75]);
  });

  it("sets a long minimumCacheTTL to bound upstream re-fetch amplification", () => {
    // At least 7 days; we ship 30. This is the bandwidth half of F-006.
    const ttl = nextConfig.images?.minimumCacheTTL;
    expect(typeof ttl).toBe("number");
    expect(ttl ?? 0).toBeGreaterThanOrEqual(7 * 24 * 60 * 60);
  });

  it("ships no wildcard remote host (exact-host allowlist only)", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      const host = typeof p.hostname === "string" ? p.hostname : "";
      expect(host).not.toContain("*");
      expect(host.length).toBeGreaterThan(0);
    }
  });
});
