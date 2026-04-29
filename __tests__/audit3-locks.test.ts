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
      const mw = read("middleware.ts");
      expect(mw).toMatch(/csrfExemptPaths\(\)\.has\(pathname\)/);
      // The previous inline Set must be gone.
      expect(mw).not.toMatch(/const csrfExemptPaths\s*=\s*new Set/);
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
      expect(route).toMatch(/getInternalToken\(\)/);
      expect(route).not.toMatch(/verifyCronAuth\(/);
    });

    it("rate-limits the endpoint via lib/rate-limit", () => {
      expect(route).toMatch(/checkRateLimit\(/);
      expect(route).toMatch(/revalidate:internal-token/);
    });

    it("emits a structured audit log on every purge", () => {
      expect(route).toMatch(/event:\s*"cache\.revalidate"/);
      expect(route).toMatch(/console\.log\(/);
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
      // Default should be strict; the flag must be set to "1" to bypass.
      expect(auth).toMatch(/CRON_ALLOW_SHARED_FALLBACK_IN_PROD\s*===\s*"1"/);
    });
  });

  // ── F-007 — Negative cache for unknown hostnames ─────────────────────
  describe("F-007 unknown-host negative cache", () => {
    const mw = read("middleware.ts");

    it("middleware writes a negative-cache entry for unknown hostnames", () => {
      expect(mw).toMatch(/site-domain-miss:/);
      expect(mw).toMatch(/expirationTtl:\s*300/);
    });

    it("middleware short-circuits on negative-cache hit before DB lookup", () => {
      // The negative cache check comes BEFORE getSiteRowByDomain.
      const idxNegative = mw.indexOf("site-domain-miss:");
      const idxDb = mw.indexOf("getSiteRowByDomain(hostname)");
      expect(idxNegative).toBeGreaterThan(0);
      expect(idxDb).toBeGreaterThan(idxNegative);
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

    it("getAllowedOrigins lives in lib/security and takes a verifiedHostname param", () => {
      expect(allowedOrigins).toMatch(
        /export function getAllowedOrigins\(verifiedHostname\?\: string\)/,
      );
      expect(mw).toMatch(/import \{ getAllowedOrigins \} from "@\/lib\/security\/allowed-origins"/);
    });

    it("OPTIONS preflight only trusts hostnames in static config", () => {
      // The preflight branch must guard the host with `getSiteByDomain`.
      const optionsBlock = mw.match(
        /request\.method === "OPTIONS"[\s\S]*?getAllowedOrigins\([^)]+\)/,
      );
      expect(optionsBlock).toBeTruthy();
      expect(optionsBlock![0]).toMatch(/getSiteByDomain\(hostname\)/);
      expect(optionsBlock![0]).toMatch(/isStaticConfigured\s*\?\s*hostname\s*:\s*undefined/);
    });
  });

  // ── F-009 — Production deploy enforces log shipping ──────────────────
  describe("F-009 production log-shipping enforcement", () => {
    const deploy = read(".github/workflows/deploy.yml");

    it("deploy workflow has a step that fails closed without log shipping", () => {
      expect(deploy).toMatch(/Enforce log shipping in production \(F-009\)/);
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

  // ── F-013 / G-27 — static CSP fallback dropped ────────────────────
  describe("F-013 / G-27 — no static CSP fallback", () => {
    const cfg = read("next.config.ts");
    it("next.config.ts no longer emits a Content-Security-Policy header", () => {
      // G-27 (Apr 2026 audit): the static CSP fallback was dropped in
      // favour of the per-request nonced policy from middleware.ts.
      // The previous test was F-013 which asserted the static fallback
      // did not allow `https:` wildcard; that fallback no longer
      // exists, so we instead assert it cannot silently come back.
      expect(cfg).not.toMatch(/"Content-Security-Policy"/);
      expect(cfg).toMatch(/G-27/);
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
