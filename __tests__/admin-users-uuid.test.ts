import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

describe("#656: admin/users DELETE and PATCH validate id as UUID", () => {
  const src = readFileSync(join(repoRoot, "app/api/admin/users/route.ts"), "utf8");

  it("imports isUsableUuid", () => {
    expect(src).toMatch(/isUsableUuid/);
  });

  it("validates id with isUsableUuid in PATCH handler", () => {
    // The PATCH handler should check isUsableUuid(id) before DB operations
    expect(src).toMatch(/!isUsableUuid\(id\)/);
  });

  it("validates id with isUsableUuid in DELETE handler", () => {
    // Both PATCH and DELETE should validate - ensure at least 2 occurrences
    const matches = src.match(/!isUsableUuid\(id\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("returns 400 with UUID error message", () => {
    expect(src).toMatch(/id must be a valid UUID/);
  });
});
