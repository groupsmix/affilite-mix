import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

describe("#648: admin/content GET validates category_id as UUID", () => {
  const src = readFileSync(join(repoRoot, "app/api/admin/content/route.ts"), "utf8");

  it("validates category_id with isUsableUuid before DB call", () => {
    expect(src).toMatch(/isUsableUuid\(categoryId\)/);
  });

  it("returns 400 for invalid category_id format", () => {
    expect(src).toMatch(/Invalid category_id format/);
  });
});
