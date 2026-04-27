/**
 * Regression locks for the fourth deep-audit pass (findings A-08…A-11).
 *
 * Each test pins the source-shape that closes a finding so a future
 * refactor cannot quietly regress the fix. Static / source-level only —
 * tests that need a live Postgres live in `__tests__/integration/`.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const repoRoot = join(__dirname, "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

describe("Audit-4 regression locks", () => {
  // ── A-08 — getTenantClient JWT memoisation ──────────────────────────
  describe("A-08 JWT cache", () => {
    const supabaseServer = read("lib/supabase-server.ts");

    it("declares a per-isolate Map for the tenant JWT cache", () => {
      expect(supabaseServer).toMatch(/_tenantJwtCache\s*:\s*Map<\s*string\s*,/);
    });

    it("caps the cache and uses a 30-second sliding window", () => {
      expect(supabaseServer).toMatch(/JWT_CACHE_SLIDING_WINDOW_MS\s*=\s*30[_]?000/);
      expect(supabaseServer).toMatch(/JWT_CACHE_MAX_ENTRIES\s*=\s*\d+/);
    });

    it("keys cache entries by (siteId, userId, role)", () => {
      // The helper composes the key from all three identifiers; we
      // accept any concatenation containing the three names.
      expect(supabaseServer).toMatch(/tenantJwtCacheKey[\s\S]*siteId[\s\S]*userId[\s\S]*role/);
    });

    it("re-uses a cached token when it is still within the window", () => {
      // Look for a cache hit branch: an `if (cached && cached.exp > now)`
      // that assigns the cached token without re-signing.
      expect(supabaseServer).toMatch(
        /cached\s*&&\s*cached\.exp\s*>\s*now[\s\S]*token\s*=\s*cached\.token/,
      );
    });

    it("exposes a test-only cache reset hook", () => {
      expect(supabaseServer).toMatch(/__resetTenantJwtCacheForTests/);
    });
  });

  // ── A-09 — current_request_site_ids() RETURNS uuid[] ────────────────
  describe("A-09 multi-site tenant scope", () => {
    const migrationPath = "supabase/migrations/00072_tenant_site_ids_array.sql";

    it("ships the 00072 migration introducing the array-shaped helper", () => {
      expect(existsSync(join(repoRoot, migrationPath))).toBe(true);
    });

    const migration = read(migrationPath);

    it("declares current_request_site_ids() RETURNS uuid[]", () => {
      expect(migration).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.current_request_site_ids\(\)\s+RETURNS\s+uuid\[\]/i,
      );
    });

    it("reads the preferred app_metadata.site_ids claim", () => {
      expect(migration).toMatch(/app_metadata,\s*site_ids/);
    });

    it("retains a backwards-compat single-claim fallback", () => {
      // Either app_metadata.site_id (server-controlled) OR top-level site_id
      // must still resolve so JWTs minted before 00072 keep working.
      expect(migration).toMatch(/app_metadata,\s*site_id/);
      expect(migration).toMatch(/->>\s*'site_id'/);
    });

    it("re-issues tenant_isolation_auth_<t> using site_id = ANY(...)", () => {
      const policyBlock = migration.match(/CREATE POLICY[\s\S]*?WITH CHECK[\s\S]*?\$f\$/);
      expect(policyBlock, "expected CREATE POLICY block in 00072").toBeTruthy();
      const policy = policyBlock![0];
      expect(policy).toMatch(/site_id\s*=\s*ANY\s*\(\s*public\.current_request_site_ids\(\)\s*\)/i);
      expect(policy).toMatch(
        /cardinality\s*\(\s*public\.current_request_site_ids\(\)\s*\)\s*>\s*0/i,
      );
    });

    it("keeps current_request_site_id() as a thin shim for legacy callers", () => {
      expect(migration).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.current_request_site_id\(\)\s+RETURNS\s+uuid/i,
      );
      expect(migration).toMatch(/\(\s*public\.current_request_site_ids\(\)\s*\)\[\s*1\s*\]/);
    });

    it("ships an idempotent down migration", () => {
      const down = read("supabase/migrations/00072_tenant_site_ids_array-down.sql");
      expect(down).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.current_request_site_ids/i);
    });

    it("getAuthenticatedClient writes app_metadata.site_ids on the JWT", () => {
      const supabaseServer = read("lib/supabase-server.ts");
      expect(supabaseServer).toMatch(/app_metadata\s*=\s*\{\s*site_ids\s*:/);
    });
  });

  // ── A-10 — frozen memoised clients + ESLint mutation guard ──────────
  describe("A-10 client freeze + ESLint guard", () => {
    it("privileged client is frozen after construction", () => {
      const src = read("lib/server-only/service-role.ts");
      expect(src).toMatch(/Object\.freeze\s*\(\s*client\s*\)/);
    });

    it("anon client is frozen after construction", () => {
      const src = read("lib/supabase-server.ts");
      expect(src).toMatch(/Object\.freeze\s*\(\s*client\s*\)/);
    });

    it("loud comment in service-role.ts warns against mutation", () => {
      const src = read("lib/server-only/service-role.ts");
      expect(src).toMatch(/A-10[\s\S]*DO NOT MUTATE THE RETURNED CLIENT/);
    });

    it("ESLint config bans `.headers.*=` mutations on memoised clients", () => {
      const cfg = read("eslint.config.mjs");
      expect(cfg).toMatch(/no-restricted-syntax/);
      // Selector targets nested MemberExpression assignments where the
      // intermediate property is `headers`.
      expect(cfg).toMatch(/left\.object\.property\.name='headers'/);
      // Selector targets direct assignment to a return value of the
      // privileged / anon / tenant getters.
      expect(cfg).toMatch(
        /getPrivilegedSupabaseClient\|getServiceClient\|getAnonClient\|getTenantClient/,
      );
    });
  });

  // ── A-11 — drop unsafe-inline + report-only rollout ─────────────────
  describe("A-11 strict CSP", () => {
    const csp = read("lib/csp.ts");
    const middleware = read("middleware.ts");

    it("script-src no longer carries 'unsafe-inline'", () => {
      // Locate the script-src directive literal in the source and assert
      // that 'unsafe-inline' is not part of it.
      const scriptSrcMatch = csp.match(/`script-src[^`]*`/);
      expect(scriptSrcMatch, "expected script-src template literal").toBeTruthy();
      expect(scriptSrcMatch![0]).not.toMatch(/'unsafe-inline'/);
    });

    it("style-src no longer carries 'unsafe-inline'", () => {
      const styleSrcMatch = csp.match(/`style-src[^`]*`/);
      expect(styleSrcMatch, "expected style-src template literal").toBeTruthy();
      expect(styleSrcMatch![0]).not.toMatch(/'unsafe-inline'/);
    });

    it("exposes a CSP_REPORT_ONLY-driven header name helper", () => {
      expect(csp).toMatch(/export\s+function\s+isCspReportOnly/);
      expect(csp).toMatch(/export\s+function\s+cspHeaderName/);
      expect(csp).toMatch(/Content-Security-Policy-Report-Only/);
    });

    it("middleware uses cspHeaderName() for the response header", () => {
      expect(middleware).toMatch(
        /response\.headers\.set\(\s*cspHeaderName\(\)\s*,\s*cspHeaderValue\s*\)/,
      );
    });

    it("middleware still uses the enforcing name on the request side", () => {
      // Next.js needs the canonical name on the *request* to inject the
      // nonce into its inline runtime — the report-only flip is response-
      // side only.
      expect(middleware).toMatch(/CSP_REQUEST_HEADER\s*=\s*"Content-Security-Policy"/);
    });
  });
});
