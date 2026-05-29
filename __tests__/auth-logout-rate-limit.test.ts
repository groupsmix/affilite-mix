import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

describe("#644: auth/logout rate limiting", () => {
  const src = readFileSync(join(repoRoot, "app/api/auth/logout/route.ts"), "utf8");

  it("uses checkRateLimit for logout endpoint", () => {
    expect(src).toMatch(/checkRateLimit\(`auth-logout:/);
  });

  it("uses failPolicy closed to prevent abuse during KV outages", () => {
    expect(src).toMatch(/failPolicy:\s*"closed"/);
  });

  it("returns 429 when rate limited", () => {
    expect(src).toMatch(/status:\s*429/);
  });

  it("accepts NextRequest parameter for IP extraction", () => {
    expect(src).toMatch(/POST\(request:\s*NextRequest\)/);
  });
});
