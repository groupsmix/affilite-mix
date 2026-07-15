/**
 * Feature: audit-fix-verification — Task 5.4
 *
 * SEC-03 allowlist cap and boundary verification (R10.5–R10.7).
 *
 * The SEC-03 control caps the number of sanctioned service-role importers so a
 * new privileged import cannot land without an audited justification. The cap
 * was reconciled to 39 in task 5.5 — the live, audited allowlist count — which
 * matches the regression lock in __tests__/audit3-locks.test.ts
 * (`expect(count).toBeLessThanOrEqual(39)`). This file pins the cap value and
 * the pass/fail behavior at the boundary without duplicating the existing
 * audit3-locks assertion (that test only checks the live length does not
 * regress; this test exercises the boundary semantics explicitly).
 *
 * Validates: Requirements 10.5, 10.6, 10.7
 */
import { describe, it, expect } from "vitest";
import { SERVICE_ROLE_IMPORT_ALLOWLIST } from "../lib/security/service-role-allowlist";

/**
 * SEC-03 cap, reconciled to the live audited allowlist count (task 5.5).
 * Single source of truth for the boundary checks below.
 *
 * Bumped 39 -> 40: lib/dal/permissions.ts now imports getPrivilegedSupabaseClient
 * to fix the authz layer (admin RBAC tables are service_role-only). Rationale
 * recorded in lib/security/service-role-allowlist.ts.
 * Bumped 40 -> 43: lib/dal/sites.ts (listAdminSites), lib/dal/niche-health.ts and
 * lib/dal/revenue-per-site.ts now import the privileged client for cross-site
 * admin dashboard reads. Rationale recorded in the allowlist.
 * Bumped 43 -> 44: lib/dal/analytics-dashboard.ts now imports the privileged
 * client for the Multi-Niche Overview rollup. Rationale recorded in the allowlist.
 * Bumped 44 -> 45: lib/dal/admin-api-tokens.ts now imports the privileged
 * client for the admin API token table (service_role-only). Rationale recorded
 * in lib/security/service-role-allowlist.ts.
 * Bumped 45 -> 46: lib/automation/db.ts is the single sanctioned importer of
 * the privileged gateway for the automation control plane. The automation_*
 * tables (service accounts, tokens, runs, actions, policies — migration
 * 2026071505) are service_role-only, and the automation API gateway has no
 * browser cookie / admin session; it authenticates a bearer token and then
 * operates on behalf of one site. Every automation DAL reaches the privileged
 * client through this one module. Rationale recorded in the allowlist.
 * Bumped 46 -> 47: lib/dal/site-presentations.ts is the single sanctioned
 * importer for the DB-authoritative presentation control plane. The
 * site_presentations table (migration 2026071506) is service_role-only for
 * writes and draft/history reads; every admin presentation DAL reaches the
 * privileged client through this one module, after super_admin session gating
 * at the route layer. Rationale recorded in the allowlist.
 */
const SEC_03_CAP = 47;

/** The SEC-03 control: passes iff the allowlist has at most SEC_03_CAP entries. */
const sec03Passes = (entryCount: number): boolean => entryCount <= SEC_03_CAP;

describe("SEC-03 allowlist cap (Task 5.4)", () => {
  it("the SEC-03 cap is 47 (R10.5)", () => {
    expect(SEC_03_CAP).toBe(47);
  });

  it("the live allowlist is at or below the cap (R10.6)", () => {
    expect(SERVICE_ROLE_IMPORT_ALLOWLIST.length).toBeLessThanOrEqual(SEC_03_CAP);
    expect(sec03Passes(SERVICE_ROLE_IMPORT_ALLOWLIST.length)).toBe(true);
  });
});

describe("SEC-03 boundary behavior (Task 5.4)", () => {
  it("passes when the allowlist has fewer than 47 entries (R10.6)", () => {
    expect(sec03Passes(0)).toBe(true);
    expect(sec03Passes(44)).toBe(true);
    expect(sec03Passes(45)).toBe(true);
    expect(sec03Passes(46)).toBe(true);
  });

  it("passes at exactly 47 entries — the cap is inclusive (R10.6)", () => {
    expect(sec03Passes(47)).toBe(true);
  });

  it("fails when the allowlist exceeds 47 entries (R10.7)", () => {
    expect(sec03Passes(48)).toBe(false);
    expect(sec03Passes(100)).toBe(false);
  });
});
