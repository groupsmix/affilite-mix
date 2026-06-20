/**
 * F3 regression: GET /api/admin/analytics/domains returns a registry-wide
 * breakdown across EVERY site. getDomainPerformance() in
 * lib/dal/analytics-dashboard.ts is the "(super-admin)" cross-site aggregate —
 * it calls listSites() and sums clicks/revenue per site, ignoring any single
 * tenant.
 *
 * Original bug: the route was guarded by withAuthz("analytics", "view"), which
 * is site-scoped and satisfied by any analytics:view holder — including the
 * read-only Analyst role — on their own active site. That leaked every tenant's
 * domains, click counts and estimated revenue to a single-tenant viewer.
 *
 * The route must gate on super_admin instead. Source-level guard, consistent
 * with __tests__/admin-route-authz-enforcement and __tests__/stripe-reconciliation-policy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSrc = readFileSync(
  resolve(__dirname, "..", "app/api/admin/analytics/domains/route.ts"),
  "utf8",
);

describe("F3: analytics/domains is gated on super_admin", () => {
  it("imports and calls the requireSuperAdmin guard", () => {
    expect(routeSrc).toMatch(/import[^;]*\brequireSuperAdmin\b/);
    expect(routeSrc).toMatch(/await\s+requireSuperAdmin\s*\(/);
  });

  it("does not gate this cross-tenant aggregate behind the site-scoped withAuthz guard", () => {
    // Precise checks (mirroring __tests__/admin-route-authz-enforcement): the
    // word may legitimately appear in an explanatory comment, so assert that
    // withAuthz is neither imported nor used as the exported handler wrapper.
    expect(routeSrc).not.toMatch(/import\s+[^;]*\bwithAuthz\b/);
    expect(routeSrc).not.toMatch(/export\s+const\s+\w+\s*=\s*withAuthz\s*\(/);
  });

  it("still serves the registry-wide getDomainPerformance aggregate", () => {
    expect(routeSrc).toMatch(/getDomainPerformance\s*\(/);
  });
});
