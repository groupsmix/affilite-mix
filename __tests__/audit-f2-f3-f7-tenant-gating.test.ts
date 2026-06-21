/**
 * Regression test for the F2/F3/F7 audit cluster (cross-tenant leak via
 * auth-only guard reading global listSites()/getSiteRowById()).
 *
 * Theme: any admin route that reads from the global tenant registry MUST
 * either be super_admin-gated (requireSuperAdmin / assertRole super_admin)
 * or membership-filtered (listAdminSiteMemberships → allowedSiteIds).
 *
 * The three prior findings all had the same root cause — a route on the
 * active-site/auth-only guard returning data from listSites()/getSiteRowById
 * without re-binding to the caller's site membership. This test would have
 * caught F7 (sites/stats/route.ts), the lone outlier the remediation pass
 * missed.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(REPO_ROOT, "app", "api", "admin");

function read(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf-8");
}

function listRouteFiles(dirRel: string): string[] {
  const abs = path.join(REPO_ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      // Recurse one level (matches Next.js app/api/admin/<resource>/[id]/route.ts)
      for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
        if (sub.isFile() && sub.name === "route.ts") {
          out.push(path.join(dirRel, entry.name, sub.name));
        }
      }
    } else if (entry.isFile() && entry.name === "route.ts") {
      out.push(path.join(dirRel, entry.name));
    }
  }
  return out;
}

/**
 * A route is "properly gated" if its source contains:
 *   - super_admin gate: `requireSuperAdmin(` or `assertRole(session, "super_admin")`,
 *   - or membership filter: `listAdminSiteMemberships(` paired with `allowedSiteIds`.
 */
function isProperlyGated(src: string): { ok: boolean; reason: string } {
  const hasSuperAdmin =
    src.includes("requireSuperAdmin(") ||
    /\bassertRole\([^)]*["']super_admin["']\s*\)/.test(src);
  const hasMembershipFilter =
    src.includes("listAdminSiteMemberships(") &&
    (src.includes("allowedSiteIds") || src.includes("allowed_site_ids"));

  if (hasSuperAdmin) return { ok: true, reason: "super_admin-gated" };
  if (hasMembershipFilter) return { ok: true, reason: "membership-filtered" };
  return { ok: false, reason: "no super_admin gate or membership filter found" };
}

describe("F2/F3/F7: cross-tenant data routes are properly gated", () => {
  describe("specific known fixes", () => {
    it("F2 — GET /api/admin/sites/[id] uses super_admin role gate", () => {
      // GET sites/[id] previously returned any tenant's full site row to any
      // site-scoped admin. The fix adds assertRole(session, "super_admin").
      const src = read("app/api/admin/sites/[id]/route.ts");
      expect(
        /\bassertRole\([^)]*["']super_admin["']\s*\)/.test(src),
        "expected assertRole(session, 'super_admin') near the GET handler",
      ).toBe(true);
    });

    it("F3 — GET /api/admin/analytics/domains uses requireSuperAdmin", () => {
      // analytics/domains previously used site-scoped withAuthz('analytics','view')
      // and iterated listSites() — leaked every tenant's domain/clicks/revenue.
      // The fix swaps the guard to requireSuperAdmin().
      const src = read("app/api/admin/analytics/domains/route.ts");
      expect(src, "must call requireSuperAdmin()").toContain("requireSuperAdmin(");
    });

    it("F7 — GET /api/admin/sites/stats membership-filters listSites() results", () => {
      // sites/stats previously used requireAdminSession() with zero membership
      // filter, exposing per-tenant counts + slug enumeration. The fix mirrors
      // the sibling list route: listAdminSiteMemberships + allowedSiteIds +
      // filter() before iterating the registry.
      const src = read("app/api/admin/sites/stats/route.ts");
      expect(src, "must import listAdminSiteMemberships").toContain(
        "listAdminSiteMemberships",
      );
      expect(src, "must compute allowedSiteIds membership set").toContain(
        "allowedSiteIds",
      );
      // The filter must actually narrow the iterated rows, not just compute the set.
      expect(src, "must apply allowedSiteIds.has(...) filter").toMatch(
        /\.has\(\s*r\.id\s*\)/,
      );
    });
  });

  describe("global invariant: every route reading listSites()/getSiteRowById is gated", () => {
    // Walk every admin route file and assert that any handler reading the
    // global tenant registry is either super_admin-gated or membership-filtered.
    // This is the regression net the original audit recommended and that
    // would have prevented F7 from being missed.
    const routes = listRouteFiles("app/api/admin");
    const offenders: { file: string; calls: string[]; reason: string }[] = [];

    for (const rel of routes) {
      const src = read(rel);
      const usesGlobalRead =
        src.includes("listSites(") || src.includes("getSiteRowById(");
      if (!usesGlobalRead) continue;

      const gate = isProperlyGated(src);
      if (!gate.ok) {
        const calls: string[] = [];
        if (src.includes("listSites(")) calls.push("listSites");
        if (src.includes("getSiteRowById(")) calls.push("getSiteRowById");
        offenders.push({ file: rel, calls, reason: gate.reason });
      }
    }

    it("has no routes that read listSites()/getSiteRowById without a gate", () => {
      expect(
        offenders,
        `Routes reading global tenant data without a super_admin gate or membership filter:\n` +
          offenders
            .map((o) => `  - ${o.file} (uses ${o.calls.join(", ")}) — ${o.reason}`)
            .join("\n"),
      ).toEqual([]);
    });
  });
});
