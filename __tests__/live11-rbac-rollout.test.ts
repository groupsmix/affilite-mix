/**
 * LIVE-11 — Regression locks for the RBAC rollout.
 *
 * The audit found that only 2 admin routes used `withAuthz()`, while 18+
 * relied on `requireAdmin()` alone (no per-feature/per-action permission
 * check). This file pins the routes that were converted so a future
 * refactor can't silently regress them back to bare `requireAdmin()`.
 *
 * If the audit later grows the rollout, add the new path here. If a
 * conversion is intentionally reverted (e.g. the route now needs
 * super_admin only and changes its permission model), update the lock.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTES_THAT_MUST_USE_WITHAUTHZ = [
  "app/api/admin/products/route.ts",
  "app/api/admin/content/route.ts",
  "app/api/admin/categories/route.ts",
  "app/api/admin/categories/usage/route.ts",
  "app/api/admin/ads/route.ts",
  "app/api/admin/ads/[id]/route.ts",
  "app/api/admin/pages/route.ts",
  "app/api/admin/pages/[id]/route.ts",
  "app/api/admin/pages/reorder/route.ts",
  "app/api/admin/ai-content/route.ts",
  "app/api/admin/affiliate-networks/route.ts",
  "app/api/admin/content-products/route.ts",
  "app/api/admin/content/clone/route.ts",
  "app/api/admin/content/share/route.ts",
  "app/api/admin/schedule/route.ts",
  "app/api/admin/analytics/route.ts",
] as const;

function readRoute(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("LIVE-11 — RBAC rollout (withAuthz)", () => {
  for (const path of ROUTES_THAT_MUST_USE_WITHAUTHZ) {
    it(`${path} uses withAuthz / authorizeResource (not bare requireAdmin)`, () => {
      const src = readRoute(path);
      const usesWithAuthz = src.includes("withAuthz(") || src.includes("authorizeResource(");
      expect(usesWithAuthz).toBe(true);
    });
  }

  it("withAuthz exposes the server-derived siteSlug to handlers", () => {
    const src = readRoute("lib/authz.ts");
    expect(src).toMatch(/siteSlug:\s*string/);
    expect(src).toMatch(/siteSlug,?\s*\}/);
  });
});
