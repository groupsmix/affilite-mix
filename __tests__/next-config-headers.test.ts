/**
 * audit-etap1 #20: every path that is explicitly EXCLUDED from the
 * middleware matcher (and therefore not covered by the per-request nonced
 * CSP) must receive a `default-src 'none'` fallback CSP via `next.config.ts`
 * `headers()`. These regressions assert the table stays in sync.
 *
 * Source patterns excluded by middleware (middleware.ts):
 *   _next/static, _next/image, favicon.ico, fonts/, api/internal/
 */
import { describe, it, expect } from "vitest";
import nextConfig from "@/next.config";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

async function loadHeaders(): Promise<HeaderRule[]> {
  if (typeof nextConfig.headers !== "function") {
    throw new Error("next.config.ts no longer exports a headers() function");
  }
  const out = await nextConfig.headers();
  return out as HeaderRule[];
}

describe("audit-etap1 #20: next.config.ts CSP fallback for middleware-excluded paths", () => {
  it("emits default-src 'none' for /_next/static/:path*", async () => {
    const headers = await loadHeaders();
    const rule = headers.find((r) => r.source === "/_next/static/:path*");
    expect(rule, "missing CSP fallback rule for /_next/static/:path*").toBeDefined();
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("default-src 'none'");
  });

  it("emits default-src 'none' for /_next/image and /_next/image/:path*", async () => {
    const headers = await loadHeaders();
    for (const source of ["/_next/image", "/_next/image/:path*"]) {
      const rule = headers.find((r) => r.source === source);
      expect(rule, `missing CSP fallback rule for ${source}`).toBeDefined();
      const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy");
      expect(csp?.value).toContain("default-src 'none'");
    }
  });

  it("emits default-src 'none' for /favicon.ico", async () => {
    const headers = await loadHeaders();
    const rule = headers.find((r) => r.source === "/favicon.ico");
    expect(rule, "missing CSP fallback rule for /favicon.ico").toBeDefined();
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("default-src 'none'");
  });

  it("emits default-src 'none' for /fonts/:path*", async () => {
    const headers = await loadHeaders();
    const rule = headers.find((r) => r.source === "/fonts/:path*");
    expect(rule, "missing CSP fallback rule for /fonts/:path*").toBeDefined();
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("default-src 'none'");
  });

  it("emits default-src 'none' for /api/internal/:path*", async () => {
    const headers = await loadHeaders();
    const rule = headers.find((r) => r.source === "/api/internal/:path*");
    expect(rule, "missing CSP fallback rule for /api/internal/:path*").toBeDefined();
    const csp = rule!.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("default-src 'none'");
  });

  it("the catch-all /(.*)  rule does NOT carry a CSP header (G-27: middleware sets per-request nonced CSP)", async () => {
    const headers = await loadHeaders();
    const catchAll = headers.find((r) => r.source === "/(.*)");
    expect(catchAll).toBeDefined();
    const csp = catchAll!.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeUndefined();
  });
});
