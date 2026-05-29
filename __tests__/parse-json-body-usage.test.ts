import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

/**
 * #655 regression: All routes that parse request JSON should use parseJsonBody()
 * instead of raw request.json() to enforce streaming body-size limits.
 */
describe("#655: parseJsonBody usage (no raw request.json)", () => {
  const routes = [
    "app/api/quiz/[slug]/submit/route.ts",
    "app/api/revalidate/route.ts",
    "app/api/admin/webhook-dlq/route.ts",
    "app/api/community/comments/route.ts",
    "app/api/community/wrist-shots/route.ts",
    "app/api/products/[productId]/price-alert/route.ts",
    "app/api/admin/affiliate-networks/route.ts",
    "app/api/admin/categories/route.ts",
    "app/api/admin/ai-content/route.ts",
  ];

  for (const route of routes) {
    it(`${route} uses parseJsonBody instead of request.json()`, () => {
      const src = readFileSync(join(repoRoot, route), "utf8");
      expect(src).toMatch(/parseJsonBody/);
      expect(src).not.toMatch(/request\.json\(\)/);
    });
  }
});
