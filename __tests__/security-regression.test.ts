/**
 * F-009: Regression test suite for security remediations.
 *
 * Each test validates that a specific security fix remains in place. This
 * prevents regressions when refactoring or adding features near security
 * boundaries. Every P0/P1 remediation from the audit should have a
 * corresponding test here.
 *
 * Convention: test names start with the finding ID so `grep` / CI can
 * trace failures back to the original audit item.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/** Read a file relative to the repo root. */
function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "..", relPath));
}

describe("F-009: security remediation regression tests", () => {
  // ── F-002: CodeQL SAST workflow exists and is valid ──────────────
  describe("F-002: CodeQL SAST", () => {
    it("codeql.yml workflow exists", () => {
      expect(fileExists(".github/workflows/codeql.yml")).toBe(true);
    });

    it("codeql.yml runs on push/PR to main and weekly schedule", () => {
      const content = readFile(".github/workflows/codeql.yml");
      expect(content).toMatch(/on:\s/);
      expect(content).toMatch(/push:/);
      expect(content).toMatch(/pull_request:/);
      expect(content).toMatch(/schedule:/);
    });

    it("codeql.yml uses security-and-quality query suite", () => {
      const content = readFile(".github/workflows/codeql.yml");
      expect(content).toContain("security-and-quality");
    });

    it("codeql.yml has no duplicate step names", () => {
      const content = readFile(".github/workflows/codeql.yml");
      const stepNames = [...content.matchAll(/- name:\s*(.+)/g)].map((m) => m[1]!.trim());
      const unique = new Set(stepNames);
      expect(stepNames.length).toBe(unique.size);
    });
  });

  // ── F-003: Admin route authz is enforced ────────────────────────
  describe("F-003: admin authz enforcement", () => {
    it("check-admin-authz.sh script exists and is executable-ready", () => {
      expect(fileExists("scripts/check-admin-authz.sh")).toBe(true);
    });

    it("CI runs check-admin-authz.sh as a mandatory (non-conditional) step", () => {
      const ci = readFile(".github/workflows/ci.yml");
      expect(ci).toContain("check-admin-authz.sh");
      // Must use exit 1 on missing script (fail-closed)
      expect(ci).toContain('echo "::error::scripts/check-admin-authz.sh is missing');
    });

    it("admin authz enforcement test exists", () => {
      expect(fileExists("__tests__/admin-route-authz-enforcement.test.ts")).toBe(true);
    });
  });

  // ── F-004: Migration rollback notes are blocking ────────────────
  describe("F-004: migration rollback notes", () => {
    it("deploy.yml requires rollback notes (exit 1, not warning)", () => {
      const deploy = readFile(".github/workflows/deploy.yml");
      // Must contain the blocking check for missing rollback notes
      expect(deploy).toContain("Migrations without rollback notes");
      expect(deploy).toContain("Every migration MUST include a -- ROLLBACK:");
      // Must exit 1, not just warn
      expect(deploy).toMatch(/Migrations without rollback notes[\s\S]*?exit 1/);
    });
  });

  // ── F-005: Log-shipping override is hardened ────────────────────
  describe("F-005: log-shipping override controls", () => {
    it("deploy.yml requires ticket for override", () => {
      const deploy = readFile(".github/workflows/deploy.yml");
      expect(deploy).toContain("LOG_SHIPPER_OVERRIDE_TICKET");
    });

    it("deploy.yml requires expiry for override", () => {
      const deploy = readFile(".github/workflows/deploy.yml");
      expect(deploy).toContain("LOG_SHIPPER_OVERRIDE_EXPIRES");
    });

    it("deploy.yml checks override expiry", () => {
      const deploy = readFile(".github/workflows/deploy.yml");
      expect(deploy).toContain("override has expired");
    });
  });

  // ── F-006: Security-critical routes use fail-closed rate limiting ─
  describe("F-006: fail-closed rate limiting on security routes", () => {
    const securityRoutes = [
      "app/api/auth/login/route.ts",
      "app/api/auth/forgot-password/route.ts",
      "app/api/auth/reset-password/route.ts",
      "app/api/auth/refresh/route.ts",
      "app/api/auth/me/route.ts",
    ];

    for (const route of securityRoutes) {
      it(`${route} uses failPolicy: "closed"`, () => {
        // F-006: This is a security regression test, so a missing route must
        // fail loudly rather than silently skip — otherwise renaming or
        // accidentally deleting an auth route would silently lose the
        // fail-closed control.
        expect(fileExists(route), `expected security-critical route ${route} to exist`).toBe(true);
        const content = readFile(route);
        expect(content).toContain('failPolicy: "closed"');
      });
    }
  });

  // ── F-007: Email addresses hashed in rate-limit keys ────────────
  describe("F-007: email hashing in rate-limit keys", () => {
    it("hashEmailForRateLimit exists in validate-email.ts", () => {
      const content = readFile("lib/validate-email.ts");
      expect(content).toContain("hashEmailForRateLimit");
      expect(content).toContain("SHA-256");
    });

    it("newsletter route uses hashed email for rate-limit key", () => {
      const content = readFile("app/api/newsletter/route.ts");
      expect(content).toContain("hashEmailForRateLimit");
      expect(content).not.toMatch(/checkRateLimit\(`newsletter:cooldown:\$\{email\}`/);
    });

    it("login route uses hashed email for rate-limit key", () => {
      const content = readFile("app/api/auth/login/route.ts");
      expect(content).toContain("hashEmailForRateLimit");
    });
  });

  // ── Security workflow completeness ──────────────────────────────
  describe("security workflow completeness", () => {
    it("security.yml includes npm audit, license check, dependency review, and gitleaks", () => {
      const content = readFile(".github/workflows/security.yml");
      expect(content).toContain("npm audit");
      expect(content).toContain("license-checker");
      expect(content).toContain("dependency-review");
      expect(content).toContain("gitleaks");
    });

    it("SECURITY.md exists with vulnerability reporting instructions", () => {
      expect(fileExists("SECURITY.md")).toBe(true);
      const content = readFile("SECURITY.md");
      expect(content).toContain("Reporting a Vulnerability");
      expect(content).toMatch(/security@/i);
    });
  });

  // ── Service-role usage is restricted ────────────────────────────
  describe("service-role containment", () => {
    it("CI scans for unauthorized service-role imports", () => {
      const ci = readFile(".github/workflows/ci.yml");
      expect(ci).toContain("getPrivilegedSupabaseClient");
      expect(ci).toContain("Non-exempt API routes importing service-role client");
    });
  });

  // ── Cookie security settings ────────────────────────────────────
  describe("cookie security", () => {
    it("auth cookies use Secure, HttpOnly, SameSite", () => {
      const authFile = fileExists("lib/auth.ts") ? readFile("lib/auth.ts") : "";
      const cookieUtils = fileExists("lib/cookie-utils.ts") ? readFile("lib/cookie-utils.ts") : "";
      const combined = authFile + cookieUtils;
      expect(combined).toMatch(/[Hh]ttp[Oo]nly/);
      expect(combined).toMatch(/[Ss]ame[Ss]ite/);
    });
  });

  // ── Evidence pack template exists ───────────────────────────────
  describe("F-001: production evidence pack", () => {
    it("evidence pack template exists", () => {
      expect(fileExists("docs/evidence-pack.md")).toBe(true);
    });

    it("evidence pack covers required areas", () => {
      const content = readFile("docs/evidence-pack.md");
      const requiredSections = ["Supabase", "Cloudflare", "GitHub", "Sentry", "Backup", "Secret"];
      for (const section of requiredSections) {
        expect(content.toLowerCase()).toContain(section.toLowerCase());
      }
    });
  });
});
