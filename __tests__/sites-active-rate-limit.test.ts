import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

describe("#645: admin/sites/active rate limiting", () => {
  const src = readFileSync(join(repoRoot, "app/api/admin/sites/active/route.ts"), "utf8");

  it("uses enforceAdminRateLimit", () => {
    expect(src).toMatch(/enforceAdminRateLimit\("sites-active"/);
  });

  it("returns rate limit response when exceeded", () => {
    expect(src).toMatch(/if \(rlResponse\) return rlResponse/);
  });
});
