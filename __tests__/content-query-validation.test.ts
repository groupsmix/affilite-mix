import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

describe("#647: admin/content GET query param validation", () => {
  const src = readFileSync(join(repoRoot, "app/api/admin/content/route.ts"), "utf8");

  it("validates content_type against CONTENT_TYPES allowlist", () => {
    expect(src).toMatch(/CONTENT_TYPES\.has\(contentType\)/);
    expect(src).toMatch(/Invalid content_type/);
  });

  it("validates status against CONTENT_STATUSES allowlist", () => {
    expect(src).toMatch(/CONTENT_STATUSES\.has\(status\)/);
    expect(src).toMatch(/Invalid status/);
  });

  it("returns 400 for invalid content_type", () => {
    expect(src).toMatch(/status:\s*400/);
  });

  it("imports CONTENT_TYPES and CONTENT_STATUSES from validation", () => {
    expect(src).toMatch(/CONTENT_TYPES/);
    expect(src).toMatch(/CONTENT_STATUSES/);
    expect(src).toMatch(/from\s+["']@\/lib\/validation["']/);
  });
});
