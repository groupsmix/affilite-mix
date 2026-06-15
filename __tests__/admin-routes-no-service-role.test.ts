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
