/**
 * F-SEC-01: CI guard — admin routes must NOT import the service-role client directly.
 *
 * Admin routes should use getTenantClient() for reads. Only cron/queue/webhook
 * contexts may use getPrivilegedSupabaseClient(). This test walks every
 * app/api/admin/** route file and fails on any direct "server-only/service-role"
 * import.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function walkRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkRouteFiles(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      results.push(full);
    }
  }
  return results;
}

/**
 * Routes that legitimately require service-role access because they operate
 * across site boundaries (e.g., listing all sites before a site is selected,
 * querying admin_site_memberships which requires elevated RLS bypass).
 */
const SERVICE_ROLE_ALLOWLIST = new Set([
  "app/api/admin/sites/route.ts",
  "app/api/admin/sites/select/route.ts",
  // Stats endpoint must list ALL sites before tenant context is established;
  // getTenantClient() mints HS256 JWTs that fail on asymmetric Supabase keys.
  "app/api/admin/sites/stats/route.ts",
  // Platform config tabs read/write tables that migrations 00033 / 00040 /
  // 2026052801 locked to service_role (site_modules, site_integrations,
  // user_site_roles) — plus roles/permissions/integration_providers which only
  // grant `authenticated` READ while these handlers also touch a service_role-only
  // table. The tenant client returns zero rows / is denied, blanking the pages.
  // Each route is super_admin-gated (withAuthz / requireAdmin+assertRole) and
  // every site-scoped DAL call carries an explicit `.eq('site_id', …)` predicate.
  // Mirrors the security allow-list in lib/security/service-role-allowlist.ts.
  "app/api/admin/modules/route.ts",
  "app/api/admin/integrations/route.ts",
  "app/api/admin/permissions/route.ts",
  // Audit Log export is super_admin-only and needs service-role because `audit_log`
  // SELECT is service_role-only (migrations 00033 / 00040). Mirrors the security
  // allow-list in lib/security/service-role-allowlist.ts.
  "app/api/admin/audit-log/export/route.ts",
  // F5 audit: hard-delete path. The DELETE handler is super_admin + step-up
  // gated at the route layer (assertRole + requireStepUpAuth) and calls
  // deleteSite() which throws unless callerRole === "super_admin" (sites.ts:361).
  // Hard-deleting a tenant registry row requires the privileged client — the
  // tenant client cannot reach the global `sites` table. Safe by construction.
  "app/api/admin/sites/[id]/route.ts",
  // B-F2: domain performance rollup is a super_admin-only cross-tenant aggregate
  // (requireSuperAdmin gate). The default RLS client only sees the active site,
  // so all non-active tenants returned 0 — the privileged client is required to
  // get real per-tenant click/revenue data. Mirrors lib/security/service-role-allowlist.ts.
  "app/api/admin/analytics/domains/route.ts",
]);

describe("F-SEC-01: admin routes must not use service-role client", () => {
  const adminDir = join(process.cwd(), "app", "api", "admin");
  const routes = walkRouteFiles(adminDir);

  it("found at least one admin route", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const route of routes) {
    const relativePath = relative(process.cwd(), route).replaceAll("\\", "/");
    if (SERVICE_ROLE_ALLOWLIST.has(relativePath)) continue;
    it(`${relativePath} does not import server-only/service-role`, () => {
      const content = readFileSync(route, "utf-8");
      const hasServiceRoleImport =
        content.includes("server-only/service-role") ||
        content.includes("getPrivilegedSupabaseClient");
      expect(
        hasServiceRoleImport,
        `${relativePath} imports the service-role client directly. ` +
          `Use getTenantClient() for admin reads instead.`,
      ).toBe(false);
    });
  }
});
