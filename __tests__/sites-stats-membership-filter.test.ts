/**
 * T1-F7 regression: GET /api/admin/sites/stats returned per-site operational
 * stats ({ activeProducts, publishedContent, clicks }) for EVERY site in the
 * registry, keyed by slug. It was guarded only by requireAdminSession() (which
 * verifies a session exists but performs no role or membership check) and then
 * iterated listSites() unfiltered. Any admin session therefore received
 * cross-tenant metrics plus full tenant enumeration.
 *
 * The fix mirrors the membership filter already used by the sibling list route
 * (app/api/admin/sites/route.ts GET): non-super_admin sessions are restricted to
 * the sites they have an admin_site_memberships row for. Source-level guard,
 * consistent with __tests__/sites-id-get-superadmin and
 * __tests__/analytics-domains-superadmin.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSrc = readFileSync(
  resolve(__dirname, "..", "app/api/admin/sites/stats/route.ts"),
  "utf8",
);

describe("T1-F7: sites/stats is membership-filtered for non-super_admins", () => {
  it("imports the membership lookup used by the sibling list route", () => {
    expect(routeSrc).toMatch(/import[^;]*\blistAdminSiteMemberships\b/);
  });

  it("restricts non-super_admin sessions to their member sites", () => {
    // Must branch on role and only widen for super_admin.
    expect(routeSrc).toMatch(/session\.role\s*!==\s*["']super_admin["']/);
    expect(routeSrc).toMatch(/listAdminSiteMemberships\s*\(\s*session\.userId/);
  });

  it("iterates the membership-scoped rows, not the full registry", () => {
    // The stats loop must consume the filtered set, not the raw listSites() result.
    expect(routeSrc).toMatch(/scopedRows\.map\s*\(/);
    expect(routeSrc).toMatch(/\.filter\s*\(\s*\(?row\)?\s*=>\s*allowedSiteIds\.has\(row\.id\)\)/);
  });
});
