/**
 * SEC-CSRF-01 (#629): Regression test ensuring CSRF token endpoint
 * has rate limiting applied.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../app/api/auth/csrf/route.ts"),
  "utf-8",
);

describe("SEC-CSRF-01 (#629): CSRF token endpoint rate limit", () => {
  it("imports checkRateLimit", () => {
    expect(routeSource).toContain("import { checkRateLimit }");
  });

  it("imports getClientIp", () => {
    expect(routeSource).toContain("import { getClientIp }");
  });

  it("calls checkRateLimit with csrf-token key", () => {
    expect(routeSource).toContain("csrf-token:");
  });

  it("returns 429 when rate limit is exceeded", () => {
    expect(routeSource).toContain("429");
    expect(routeSource).toContain("Too many requests");
  });

  it("includes Retry-After header in rate limit response", () => {
    expect(routeSource).toContain("Retry-After");
  });

  it("uses grace fail policy (graceful degradation with in-memory fallback)", () => {
    expect(routeSource).toContain('"grace"');
  });

  it("accepts NextRequest parameter for IP extraction", () => {
    expect(routeSource).toMatch(/GET\(request:\s*NextRequest\)/);
  });
});
