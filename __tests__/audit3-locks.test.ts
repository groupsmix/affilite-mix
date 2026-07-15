/**
 * Regression locks for the third deep-audit pass (findings F-001…F-014
 * in the prompt-1777224371731 audit, with numbering distinct from the
 * earlier deep-audit pass).
 *
 * Each test pins the exact source-shape that closes a finding so a
 * future refactor cannot quietly regress the fix. Tests that depend on
 * a live Supabase instance live in `__tests__/integration/` and are
 * skipped here; this file only contains static / source-level
 * assertions that run on every CI invocation.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const repoRoot = join(__dirname, "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

describe("Audit-3 regression locks", () => {
  // ── F-001 — License / visibility / package metadata alignment ────────
  describe("F-001 license posture", () => {
    it("LICENSE declares source-available + all-rights-reserved, not MIT (G-49)", () => {
      const license = read("LICENSE");
      // G-49: the title was reworded from "Proprietary" to
      // "Source-Available — All Rights Reserved (No License Granted)" to
      // remove the ambiguity that public GitHub visibility implies any
      // open-source grant. Lock the new wording so a refactor can't
      // accidentally restore the old, easily-misread title.
      expect(license).toMatch(/Source-Available/i);
      expect(license).toMatch(/All Rights Reserved/i);
      expect(license).toMatch(/no license[\s\S]{0,120}is granted/i);
      // Must not still be the gitleaks MIT header that PR #298 inherited.
      expect(license).not.toMatch(/Copyright \(c\) 2019 Zachary Rice/);
      expect(license).not.toMatch(/Permission is hereby granted, free of charge/);
    });

    it("README license section matches the LICENSE file", () => {
      const readme = read("README.md");
      expect(readme).toMatch(/source-available/i);
      expect(readme).toMatch(/all-rights-reserved|all rights reserved/i);
      // No stale claim that the source is MIT-licensed.
      expect(readme.toLowerCase()).not.toMatch(/mit licen[sc]e/);
    });

    it("package.json carries an explicit license field aligned with LICENSE", () => {
      const pkg = JSON.parse(read("package.json"));
      expect(pkg.private).toBe(true);
      expect(pkg.license).toBe("SEE LICENSE IN LICENSE");
    });
  });

  // ── F-002 — RLS coverage on tenant-scoped tables ─────────────────────
  describe("F-002 RLS coverage", () => {
    const harden = read("supabase/migrations/00067_harden_tenant_isolation_rls.sql");

    it("00067 emits tenant_isolation_auth_<table> for every site_id table", () => {
      // Dynamic loop builds the policy from pg_tables WHERE site_id exists.
      expect(harden).toMatch(/FOR\s+t\s+IN[\s\S]*pg_tables/i);
      expect(harden).toMatch(/has_site_id\s+boolean/);
      expect(harden).toMatch(/'tenant_isolation_auth_'\s*\|\|\s*t/);
    });

    it("00067 forbids the IS NULL fallback that 00064 introduced", () => {
      // The whole point of 00067 is that we no longer accept missing
      // site_id claims as "see everything".
      const policyBlock = harden.match(/CREATE POLICY[\s\S]*?WITH CHECK[\s\S]*?\$f\$/i);
      expect(policyBlock, "expected CREATE POLICY block").toBeTruthy();
      const policy = policyBlock![0];
      expect(policy).toMatch(/current_request_site_id\(\)\s+IS\s+NOT\s+NULL/i);
      expect(policy).toMatch(/current_request_site_id\(\)\s*=\s*site_id/i);
      expect(policy).not.toMatch(/IS\s+NULL\s+OR/i);
    });

    it("00067 reads site_id from app_metadata, not user_metadata", () => {
      expect(harden).toMatch(/app_metadata,\s*site_id/);
      expect(harden).not.toMatch(/user_metadata\s*,\s*site_id/);
    });

    it("credential / RBAC / audit tables have an explicit deny policy", () => {
      const denyTables = [
        "admin_users",
        "roles",
        "permissions",
        "role_permissions",
        "user_site_roles",
        "audit_log",
        "stripe_events",
      ];
      for (const t of denyTables) {
        expect(harden, `missing deny policy for ${t}`).toContain(`'${t}'`);
      }
      expect(harden).toMatch(/'authenticated_no_access_'\s*\|\|\s*t/);
      expect(harden).toMatch(/USING\s*\(\s*false\s*\)/i);
      expect(harden).toMatch(/WITH\s+CHECK\s*\(\s*false\s*\)/i);
    });
  });

  // ── F-003 — Service-role import allow-list & ESLint guard ────────────
  describe("F-003 service-role import containment", () => {
    it("allow-list module exists and lists every current importer", async () => {
      const allowlistPath = "lib/security/service-role-allowlist.ts";
      expect(existsSync(join(repoRoot, allowlistPath))).toBe(true);
      const mod = await import("../lib/security/service-role-allowlist");
      const list = mod.SERVICE_ROLE_IMPORT_ALLOWLIST;
      // Sanity: required entries that close out F-002 from PR #301.
      expect(list).toContain("lib/server-only/service-role.ts");
      expect(list).toContain("lib/supabase-server.ts");
      expect(list).toContain("lib/authz.ts");
      expect(list).toContain("app/api/queue/clicks/route.ts");
      // Cron consumers
      expect(list).toContain("app/api/cron/publish/route.ts");
      expect(list).toContain("app/api/cron/sitemap-refresh/route.ts");
      expect(list).toContain("app/api/cron/data-retention/route.ts");
      expect(list).toContain("app/api/cron/epc-recompute/route.ts");
      expect(list).toContain("app/api/cron/price-scrape/route.ts");
    });

    it("every non-test importer of the gateway is on the allow-list", async () => {
      const mod = await import("../lib/security/service-role-allowlist");
      const allow = new Set<string>(mod.SERVICE_ROLE_IMPORT_ALLOWLIST);

      // Match an actual ES import statement against the gateway path,
      // not stray references in comments or string literals.
      const importRe =
        /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["']([^"']*server-only\/service-role)["']/;

      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
          const rel = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            if (
              entry.name === "node_modules" ||
              entry.name === ".next" ||
              entry.name === ".open-next" ||
              entry.name === "__tests__"
            ) {
              continue;
            }
            walk(rel);
          } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
            const src = readFileSync(join(repoRoot, rel), "utf8");
            if (importRe.test(src)) {
              const norm = rel.replace(/^\.\//, "");
              if (!allow.has(norm)) offenders.push(norm);
            }
          }
        }
      };
      walk("app");
      walk("lib");
      walk("workers");
      expect(offenders, "unexpected service-role importer").toEqual([]);
    });

    it("ESLint config forbids importing getServiceClient from supabase-server", () => {
      const eslint = read("eslint.config.mjs");
      expect(eslint).toMatch(/no-restricted-imports/);
      expect(eslint).toMatch(/getServiceClient/);
      expect(eslint).toMatch(/server-only\/service-role/);
    });

    it("CODEOWNERS routes the service-role gateway through @groupsmix/security", () => {
      const codeowners = read(".github/CODEOWNERS");
      expect(codeowners).toMatch(/\/lib\/server-only\/\s+@groupsmix\/security/);
      expect(codeowners).toMatch(/service-role-allowlist\.ts\s+@groupsmix\/security/);
    });

    it("SEC-03: service_role call-site count does not regress", async () => {
      const mod = await import("../lib/security/service-role-allowlist");
      const count = mod.SERVICE_ROLE_IMPORT_ALLOWLIST.length;
      // Baseline: current allowlist size. If this increases, the PR must
      // justify the new call site with an audited-service-role comment.
      // Bumped 30 -> 31 on merging main into this branch: main added
      // lib/dal/price-alerts.ts and this PR added lib/dal/admin-site-memberships.ts
      // — two independently audited service-role importers (see the
      // audited-service-role comments beside each entry in the allowlist).
      // Bumped 31 -> 35: the platform admin tabs (modules, integrations,
      // permissions) and the audit-log page must read via the privileged gateway
      // because migrations 00033 / 00040 / 2026052801 locked site_modules,
      // site_integrations, user_site_roles, roles, permissions,
      // integration_providers and audit_log to service_role. The tenant client read
      // zero rows, blanking these pages. Each importer is super_admin-gated and
      // site-scoped — see the allowlist comments.
      // Bumped 36 -> 37: B-F2 audit — GET /api/admin/analytics/domains now imports
      // getPrivilegedSupabaseClient to fix the domain-performance rollup returning 0
      // for every non-active tenant (the RLS client only sees the active site). The
      // route is super_admin-gated (requireSuperAdmin) and is inherently a cross-tenant
      // aggregate — privileged client is required by design. Entry added to both the
      // lib/security/service-role-allowlist.ts and the test allowlist above.
      // Bumped 37 -> 38: the audit *writer* (lib/audit-log.ts) now persists via the
      // privileged gateway. `audit_log` INSERT is service_role-only (migration
      // 2026050103); the tenant client was RLS-denied (degrading to anon on a
      // JWT-secret mismatch), so every event was silently dropped. The ledger spans
      // all sites + global/auth events (site_id = NULL), hence the cross-tenant
      // .unsafeNoSiteFilter() opt-out. Reached only from super_admin/auth-gated
      // handlers; entry + rationale added to lib/security/service-role-allowlist.ts.
      // Bumped 38 -> 39: lib/dal/permissions.ts now imports getPrivilegedSupabaseClient
      // because hasPermission() must read admin_users, user_site_roles, roles and
      // permissions/role_permissions, all of which are service_role-only tables.
      // The tenant client returned zero rows for these lookups, causing every
      // /api/admin/* mutation behind withAuthz() to return 503. Rationale added to
      // lib/security/service-role-allowlist.ts.
      // Bumped 39 -> 42: lib/dal/sites.ts (listAdminSites), lib/dal/niche-health.ts
      // and lib/dal/revenue-per-site.ts now import the privileged client so the
      // Niche Health and Estimated Revenue (7d) dashboard cards can read the global
      // `sites` registry and aggregate per-site clicks/content across tenants. The
      // authenticated role has no SELECT policy on `sites`, so tenant-scoped calls
      // returned zero rows and the cards were blank. Reached only from the
      // super_admin-gated dashboard.
      // Bumped 44 -> 45: lib/dal/admin-api-tokens.ts now imports the privileged
      // client for the admin API token table (service_role-only). The table stores
      // token hashes generated by super_admin and exchanged for session cookies via
      // /api/auth/token-login. Rationale recorded in the allowlist.
      // Removed 45 -> 44: the dead feature-flags admin route was deleted after the
      // standalone feature-flags UI was removed.
      // Bumped 44 -> 45: GET /api/admin/audit-log/export now imports the privileged
      // client so super_admin can export the audit_log CSV. `audit_log` SELECT is
      // service_role-only (migrations 00033 / 00040); the tenant client returns zero
      // rows. The route is requireSuperAdmin-gated and scopes all queries to the
      // active site_id. Rationale recorded in the allowlist.
      // Bumped 45 -> 46: lib/automation/db.ts is the single sanctioned importer
      // of the privileged gateway for the automation control plane. The
      // automation_* tables (migration 2026071505) are service_role-only and the
      // automation API gateway has no browser cookie / admin session — it
      // authenticates a bearer token, then operates on behalf of one site. Every
      // automation DAL reaches the privileged client through this one module.
      // Rationale recorded in lib/security/service-role-allowlist.ts.
      expect(count).toBeLessThanOrEqual(46);
    });
  });

  // ── F-004 — CSRF-exempt registry with compensating controls ──────────
  describe("F-004 CSRF-exempt registry", () => {
    it("registry exists and every entry has compensating controls + owner", async () => {
      const registry = await import("../lib/security/csrf-exempt-registry");
      const routes = registry.CSRF_EXEMPT_ROUTES;
      expect(routes.length).toBeGreaterThan(0);
      for (const r of routes) {
        expect(r.path, `entry missing path`).toMatch(/^\/api\//);
        expect(r.reason, `entry ${r.path} missing reason`).toBeTruthy();
        expect(
          r.compensatingControls.length,
          `entry ${r.path} has no compensating controls`,
        ).toBeGreaterThan(0);
        expect(r.owner, `entry ${r.path} missing security/platform owner`).toMatch(
          /^@groupsmix\/(security|platform|engineering|data-platform)$/,
        );
      }
    });

    it("middleware delegates exemption checks to the registry", () => {
      // F-007: CSRF (incl. exemption checks) extracted to lib/middleware/csrf;
      // middleware delegates via withCsrf. Pin both the delegation and the
      // registry lookup in its new module home.
      const mw = read("middleware.ts");
      expect(mw).toMatch(/withCsrf\(request, ctx\)/);
      const csrf = read("lib/middleware/csrf.ts");
      expect(csrf).toMatch(/csrfExemptPaths\(\)\.has\(pathname\)/);
      // The previous inline Set must be gone (the registry is the single source).
      expect(csrf).not.toMatch(/const csrfExemptPaths\s*=\s*new Set/);
    });

    it("registry covers every exempt path the middleware previously hard-coded", async () => {
      const registry = await import("../lib/security/csrf-exempt-registry");
      const paths = new Set(registry.CSRF_EXEMPT_ROUTES.map((r) => r.path));
      const required = [
        "/api/auth/csrf",
        "/api/auth/refresh",
        "/api/membership/webhook",
        "/api/revalidate",
        "/api/track/click",
        "/api/vitals",
        "/api/track/impression",
        "/api/csp-report",
        "/api/queue/clicks",
        "/api/newsletter/unsubscribe",
      ];
      for (const p of required) expect(paths.has(p), `missing ${p}`).toBe(true);
    });
  });

  // ── F-005 — /api/revalidate rate-limit + audit log ───────────────────
  describe("F-005 revalidate hardening", () => {
    const route = read("app/api/revalidate/route.ts");

    it("uses INTERNAL_API_TOKEN, not the shared CRON secret", () => {
      expect(route).toMatch(/getInternalTokenFor\(/);
      expect(route).not.toMatch(/verifyCronAuth\(/);
    });

    it("rate-limits the endpoint via lib/rate-limit", () => {
      expect(route).toMatch(/checkRateLimit\(/);
      expect(route).toMatch(/revalidate:internal-token/);
    });

    it("emits a structured audit log on every purge", () => {
      expect(route).toMatch(/event:\s*"cache\.revalidate"/);
      expect(route).toMatch(/logger\.info\(/);
    });
  });

  // ── F-006 — Cron fallback fail-closed in production ──────────────────
  describe("F-006 cron fallback enforcement", () => {
    const auth = read("lib/cron-auth.ts");

    it("cron-auth fails closed when only CRON_SECRET is configured in prod", () => {
      // The implementation tracks per-trigger configuration explicitly
      // and rejects when the fallback alone is configured in production.
      expect(auth).toMatch(/perTriggerConfigured/);
      expect(auth).toMatch(/process\.env\.NODE_ENV\s*===\s*"production"/);
      expect(auth).toMatch(/CRON_ALLOW_SHARED_FALLBACK_IN_PROD/);
    });

    it("escape-hatch is opt-in via env var, not on by default", () => {
      // Default should be strict; the flag must be parsed through the
      // canonical env-bool helper (SEC-02, etap-3) so any boolean spelling
      // works consistently. Either the legacy literal check OR the helper
      // call satisfies this regression lock.
      const legacy = /CRON_ALLOW_SHARED_FALLBACK_IN_PROD\s*===\s*"1"/;
      const helper = /parseBoolEnv\(\s*["']CRON_ALLOW_SHARED_FALLBACK_IN_PROD["']/;
      expect(legacy.test(auth) || helper.test(auth)).toBe(true);
    });
  });

  // ── F-007 / G-34 — Negative cache for unknown hostnames ──────────────
  describe("F-007 / G-34 unknown-host negative cache", () => {
    // F-007: the domain→site resolution logic (negative cache, TTL ramp, LRU
    // guard) was extracted from middleware.ts into lib/middleware/site-resolution.ts.
    // The invariants are unchanged; these locks now follow the code to its module.
    const mw = read("lib/middleware/site-resolution.ts");
    const guard = read("lib/security/unknown-host-guard.ts");

    it("middleware writes a negative-cache entry for unknown hostnames", () => {
      expect(mw).toMatch(/site-domain-miss:/);
    });

    it("middleware short-circuits on negative-cache hit before DB lookup", () => {
      // The negative cache check comes BEFORE getMiddlewareSiteRowByDomain.
      const idxNegative = mw.indexOf("site-domain-miss:");
      const idxDb = mw.indexOf("getMiddlewareSiteRowByDomain(hostname)");
      expect(idxNegative).toBeGreaterThan(0);
      expect(idxDb).toBeGreaterThan(idxNegative);
    });

    it("G-34: TTL ramps via getNegativeCacheTtlSeconds, not a flat 300s", () => {
      // The flat `expirationTtl: 300` literal must be gone — the TTL
      // is now derived from the ramp helper so repeat-offender hosts
      // climb toward the 1-hour ceiling.
      expect(mw).toMatch(/getNegativeCacheTtlSeconds\(/);
      expect(mw).not.toMatch(/expirationTtl:\s*300\b/);
      // The KV value is now JSON-encoded with a miss counter.
      expect(mw).toMatch(/JSON\.stringify\(\{\s*m:\s*nextMissCount\s*\}\)/);
    });

    it("G-34: negative-cache hit also ramps the TTL (not just first miss)", () => {
      // Regression lock for the bug where `priorMissCount` was only
      // ever set on a cache hit but the cache-hit branch returned the
      // 404 immediately without re-writing the KV entry. The result
      // was that `nextMissCount` stayed pinned at 1 and the TTL never
      // climbed above the floor. The hit branch must now also write
      // an incremented miss count back to KV with the ramped TTL.
      const hitBranch = mw.match(
        /if \(isNegativeCached\) \{[\s\S]*?nicheNotFoundResponse[\s\S]*?\}/,
      );
      expect(hitBranch).toBeTruthy();
      expect(hitBranch![0]).toMatch(/getNegativeCacheTtlSeconds\(/);
      expect(hitBranch![0]).toMatch(/kv\.put\(\s*negativeCacheKey/);
      expect(hitBranch![0]).toMatch(/JSON\.stringify\(\{\s*m:\s*nextMissCount\s*\}\)/);
    });

    it("G-34: ramp helper caps at 1 hour and starts at 5 minutes", () => {
      expect(guard).toMatch(/NEGATIVE_CACHE_TTL_FLOOR_SECONDS\s*=\s*300/);
      expect(guard).toMatch(/NEGATIVE_CACHE_TTL_CEILING_SECONDS\s*=\s*3600/);
    });

    it("G-34: middleware enforces a worker-wide unknown-host LRU cap", () => {
      // Cap enforcement runs *before* the KV negative-cache read so the
      // KV namespace itself is shielded from a distributed unique-host
      // flood. Pin both the import and the call-site location.
      expect(mw).toMatch(
        /import \{[\s\S]*?recordUnknownHostKvAccess[\s\S]*?\} from "@\/lib\/security\/unknown-host-guard"/,
      );
      const idxGuard = mw.indexOf("recordUnknownHostKvAccess(hostname)");
      const idxNegative = mw.indexOf("site-domain-miss:");
      expect(idxGuard).toBeGreaterThan(0);
      expect(idxNegative).toBeGreaterThan(idxGuard);
    });

    it("G-34: LRU cap is configured at 100 unique hosts per 1s window", () => {
      expect(guard).toMatch(/MAX_UNIQUE_HOSTS\s*=\s*100/);
      expect(guard).toMatch(/WINDOW_MS\s*=\s*1000/);
    });
  });

  // ── G-35 — Maintenance response is never cached ──────────────────────
  describe("G-35 maintenance response Cache-Control", () => {
    // F-007: the maintenance 503 branches live in lib/middleware/maintenance.ts
    // (withMaintenance). Read that module directly rather than the middleware
    // entrypoint that merely composes it.
    const mw = read("lib/middleware/maintenance.ts");

    it("both maintenance 503 branches set Cache-Control: no-store", () => {
      // The env-var branch and the KV-flag branch each return a 503;
      // every one of them must mark the response as no-store so a CDN
      // or browser does not pin a stale maintenance page after the
      // operator has flipped the flag back off.
      const matches = mw.match(/Cache-Control"?\s*:\s*"no-store"/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const pragmas = mw.match(/Pragma"?\s*:\s*"no-cache"/g) ?? [];
      expect(pragmas.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── F-008 — CORS does not auto-trust runtime hostnames ───────────────
  describe("F-008 verified-only CORS allow-list", () => {
    const mw = read("middleware.ts");
    // G-47: getAllowedOrigins moved to lib/security/allowed-origins.ts so
    // CSRF-exempt route handlers (e.g. /api/vitals) can reuse the same
    // trust model. The middleware imports it; the assertions below now
    // pin the helper's source location and its parameter name.
    const allowedOrigins = read("lib/security/allowed-origins.ts");

    it("getAllowedOrigins lives in lib/security and takes a VerifiedSiteRef param (G-33)", () => {
      // G-33: signature must REQUIRE a verified site reference (not a raw
      // hostname) so an unverified `Host` header cannot extend the
      // allow-list. The lock pins both the parameter shape and the
      // import path in middleware.
      expect(allowedOrigins).toMatch(
        /export function getAllowedOrigins\(verifiedSite\?\: VerifiedSiteRef \| null\)/,
      );
      expect(allowedOrigins).toMatch(
        /export interface VerifiedSiteRef \{[\s\S]*?slug: string;[\s\S]*?domain: string;/,
      );
      // F-007: middleware imports getAllowedOrigins for the response-CORS
      // branch; the VerifiedSiteRef type now travels with the extracted CORS
      // module, which must import it from the same canonical source so the
      // trust model stays single-homed.
      expect(mw).toMatch(/import \{ getAllowedOrigins \} from "@\/lib\/security\/allowed-origins"/);
      const corsMod = read("lib/middleware/cors.ts");
      expect(corsMod).toMatch(
        /import \{ getAllowedOrigins, type VerifiedSiteRef \} from "@\/lib\/security\/allowed-origins"/,
      );
    });

    it("OPTIONS preflight only trusts hostnames in static config (G-33)", () => {
      // F-007: preflight extracted to lib/middleware/cors. The guarantee is
      // unchanged — the branch must guard the host with `getSiteByDomain`
      // and pass a `VerifiedSiteRef` (not a raw hostname) into
      // `getAllowedOrigins`. DB-managed custom domains have not been
      // resolved yet at preflight time, so they cannot be trusted.
      // middleware must delegate to the extracted module:
      expect(mw).toMatch(/withCorsPreflight\(request, ctx\)/);
      const corsMod = read("lib/middleware/cors.ts");
      const optionsBlock = corsMod.match(
        /request\.method !== "OPTIONS"[\s\S]*?getAllowedOrigins\([^)]+\)/,
      );
      expect(optionsBlock).toBeTruthy();
      expect(optionsBlock![0]).toMatch(/getSiteByDomain\(hostname\)/);
      // No raw hostname is passed to getAllowedOrigins at preflight.
      expect(optionsBlock![0]).not.toMatch(/getAllowedOrigins\(\s*hostname\s*\)/);
      expect(optionsBlock![0]).toMatch(/getAllowedOrigins\(\s*preflightVerifiedSite\s*\)/);
    });

    it("CSRF / response CORS branches pass the verified site, never raw hostname (G-33)", () => {
      // None of the call sites in middleware should pass a bare
      // `hostname` argument to `getAllowedOrigins` — only the typed
      // `verifiedSite` reference built from a static-config or DB-row
      // lookup is acceptable.
      expect(mw).not.toMatch(/getAllowedOrigins\(\s*hostname\s*\)/);
      const calls = mw.match(/getAllowedOrigins\([^)]*\)/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call).toMatch(/(verifiedSite|preflightVerifiedSite)/);
      }
    });
  });

  // ── F-009 — Production deploy enforces log shipping ──────────────────
  describe("F-009 production log-shipping enforcement", () => {
    const deploy = read(".github/workflows/deploy.yml");

    it("deploy workflow has a step that fails closed without log shipping", () => {
      expect(deploy).toMatch(/Enforce log shipping in production \(F-005/);
      expect(deploy).toMatch(/LOG_SHIPPER_ENABLED/);
      expect(deploy).toMatch(/LOG_SHIPPER_REQUIRED_OVERRIDE/);
      expect(deploy).toMatch(/exit 1/);
    });
  });

  // ── F-010 — Branch protection settings source-controlled ─────────────
  describe("F-010 branch-protection IaC", () => {
    it("main protection ruleset exists in repo", () => {
      const path = ".github/rulesets/main-protection.json";
      expect(existsSync(join(repoRoot, path))).toBe(true);
      const json = JSON.parse(read(path));
      expect(json.name).toMatch(/main/i);
      // Required status checks must be declared.
      const rules = JSON.stringify(json);
      expect(rules).toMatch(/required_status_checks/);
    });
  });

  // ── F-011 — Supabase CLI version pinned ──────────────────────────────
  describe("F-011 Supabase CLI version pin", () => {
    const ci = read(".github/workflows/ci.yml");
    it("ci.yml does not use `version: latest` for supabase/setup-cli", () => {
      // Find the setup-cli step and assert the next `version:` line is
      // a concrete version string, not "latest".
      const idx = ci.indexOf("supabase/setup-cli");
      expect(idx).toBeGreaterThan(0);
      const tail = ci.slice(idx, idx + 400);
      expect(tail).toMatch(/version:\s*\d+\.\d+\.\d+/);
      expect(tail).not.toMatch(/version:\s*latest/);
    });
  });

  // ── F-012 — gitleaks binary not committed ────────────────────────────
  describe("F-012 no committed gitleaks binary", () => {
    it("repo root has no gitleaks binary or tarball", () => {
      const offenders = readdirSync(repoRoot).filter(
        (n) => n === "gitleaks" || /^gitleaks_.*\.(tar\.gz|zip)$/.test(n),
      );
      expect(offenders).toEqual([]);
    });

    it(".gitignore protects against re-introduction", () => {
      const gi = read(".gitignore");
      expect(gi).toMatch(/^gitleaks$/m);
      expect(gi).toMatch(/^gitleaks_\*\.tar\.gz$/m);
    });
  });

  // ── F-013 / G-27 / audit-etap1 #20 — static CSP fallback scoped to excluded paths ─
  describe("F-013 / G-27 / audit-etap1 #20 — CSP fallback only on middleware-excluded paths", () => {
    const cfg = read("next.config.ts");
    it("the catch-all /(.*)  rule still does NOT emit a Content-Security-Policy header (G-27)", () => {
      // G-27 (Apr 2026 audit) + audit-etap1 #20 (May 2026 audit): the
      // catch-all CSP fallback was dropped in favour of the per-request
      // nonced policy from middleware.ts. CSP is now ONLY allowed on the
      // narrow source patterns that match middleware-excluded paths
      // (`_next/static`, `_next/image`, `favicon.ico`, `fonts/`,
      // `api/internal/`). The catch-all `/(.*)`  rule must never carry a
      // CSP header — duplicate CSP on the same response silently
      // disables our per-request nonced policy.
      const catchAllRule = cfg.match(/source:\s*"\/\(\.\*\)"[\s\S]*?\}\s*,\s*\]/);
      expect(catchAllRule, "could not find /(.*) headers rule").not.toBeNull();
      expect(catchAllRule![0]).not.toMatch(/"Content-Security-Policy"/);
      expect(cfg).toMatch(/G-27/);
    });
    it("audit-etap1 #20: middleware-excluded paths carry a `default-src 'none'` CSP", () => {
      expect(cfg).toMatch(/audit-etap1 #20/);
      expect(cfg).toMatch(/_next\/static/);
      expect(cfg).toMatch(/default-src 'none'/);
    });
  });

  // ── F-014 — Queue clicks payload validation ──────────────────────────
  describe("F-014 queue/clicks validation", () => {
    const route = read("app/api/queue/clicks/route.ts");

    it("validates UUID-shape on site_id", () => {
      expect(route).toMatch(/SITE_ID_RE\s*=\s*\/\^/);
    });

    it("requires affiliate_url to be http(s)", () => {
      expect(route).toMatch(/ALLOWED_URL_PROTOCOLS/);
      expect(route).toMatch(/new URL\(value\)/);
    });

    it("caps batch size", () => {
      expect(route).toMatch(/MAX_MESSAGES_PER_BATCH/);
      expect(route).toMatch(/status:\s*413/);
    });

    it("logs structured rejection metric on dropped messages", () => {
      expect(route).toMatch(/dropped \$\{rejectedCount\} invalid message/);
    });
  });
});
