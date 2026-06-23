/**
 * Feature: audit-fix-verification — Task 5.3
 *
 * Static-source verification for R10 domain-performance wiring and allowlist
 * membership. These checks confirm the already-applied B-F2 fix stays wired:
 *
 *   - getDomainPerformance accepts an injectable DalClientGetter (R10.1).
 *   - The domains route passes getPrivilegedSupabaseClient as that getter so
 *     the cross-tenant rollup bypasses RLS and returns real data (R10.2).
 *   - Both the runtime allowlist (lib/security/service-role-allowlist.ts) and
 *     the test-side allowlist (__tests__/admin-routes-no-service-role.test.ts)
 *     list the domain-performance route as a sanctioned service-role importer
 *     (R10.4).
 *
 * Validates: Requirements 10.1, 10.2, 10.4
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SERVICE_ROLE_IMPORT_ALLOWLIST } from "../lib/security/service-role-allowlist";

const repoRoot = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const DOMAINS_ROUTE_PATH = "app/api/admin/analytics/domains/route.ts";

const routeSrc = read(DOMAINS_ROUTE_PATH);
const dalSrc = read("lib/dal/analytics-dashboard.ts");

describe("R10: domain-performance route wiring (Task 5.3)", () => {
  it("getDomainPerformance accepts an injectable DalClientGetter (R10.1)", () => {
    // Pin the dependency-injection seam: the signature must take a
    // DalClientGetter so the privileged client can be threaded in by the route
    // and a fake client by the property tests.
    expect(dalSrc).toMatch(
      /export\s+async\s+function\s+getDomainPerformance\s*\([\s\S]*?getClient\s*:\s*DalClientGetter/,
    );
  });

  it("the domains route imports getPrivilegedSupabaseClient (R10.2)", () => {
    expect(routeSrc).toMatch(
      /import\s+\{[^}]*\bgetPrivilegedSupabaseClient\b[^}]*\}\s+from\s+["']@\/lib\/server-only\/service-role["']/,
    );
  });

  it("the domains route passes getPrivilegedSupabaseClient to getDomainPerformance (R10.2)", () => {
    // The call spans multiple lines with an explanatory comment between the
    // since arg and the client getter, so match across whitespace/comments.
    expect(routeSrc).toMatch(
      /getDomainPerformance\s*\([\s\S]*?getPrivilegedSupabaseClient[\s\S]*?\)/,
    );
  });
});

describe("R10: allowlist membership for the domain-performance route (Task 5.3)", () => {
  it("the runtime allowlist lists the domain-performance route entry (R10.4)", () => {
    expect(SERVICE_ROLE_IMPORT_ALLOWLIST).toContain(DOMAINS_ROUTE_PATH);
  });

  it("the test-side allowlist lists the domain-performance route entry (R10.4)", () => {
    // The SERVICE_ROLE_ALLOWLIST Set in admin-routes-no-service-role.test.ts is
    // not exported, so assert membership against its source text. This is the
    // companion "test allowlist" referenced by the design's coverage table.
    const testAllowlistSrc = read("__tests__/admin-routes-no-service-role.test.ts");
    const setBlock = testAllowlistSrc.match(
      /const\s+SERVICE_ROLE_ALLOWLIST\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
    );
    expect(setBlock, "expected SERVICE_ROLE_ALLOWLIST Set in test file").toBeTruthy();
    expect(setBlock![1]).toContain(`"${DOMAINS_ROUTE_PATH}"`);
  });
});
