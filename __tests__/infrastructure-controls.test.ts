/**
 * Infrastructure and operational controls verification.
 *
 * Covers audit risks 6, 7, 8, 9, 10, 14, 15, 20, 22, 23, 24
 * by verifying that the required scripts, workflows, docs, and
 * configurations exist and contain expected content.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "..", relPath));
}

describe("Risk-7: Supabase RLS verification", () => {
  it("db-audit.sh exists and checks RLS on all tables", () => {
    expect(fileExists("scripts/db-audit.sh")).toBe(true);
    const content = readFile("scripts/db-audit.sh");
    // Must check RLS is enabled on all tables
    expect(content).toContain("relrowsecurity");
    // Must check anon role privileges
    expect(content).toContain("anon");
    // Must fail on unexpected policies
    expect(content).toContain("exit 1");
  });

  it("CI runs db-audit as a dedicated job", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("db-audit");
    expect(ci).toContain("scripts/db-audit.sh");
  });

  it("public-rls-inventory.md documents allowed policies", () => {
    expect(fileExists("docs/public-rls-inventory.md")).toBe(true);
  });
});

describe("Risk-8: Service-role blast radius containment", () => {
  it("service-role-allowlist.ts exists with restricted entries", () => {
    expect(fileExists("lib/security/service-role-allowlist.ts")).toBe(true);
    const content = readFile("lib/security/service-role-allowlist.ts");
    expect(content).toContain("SERVICE_ROLE_IMPORT_ALLOWLIST");
  });

  it("CI scans for unauthorized service-role imports", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("getPrivilegedSupabaseClient");
    expect(ci).toContain("Non-exempt API routes importing service-role client");
  });

  it("CODEOWNERS protects service-role files", () => {
    expect(fileExists(".github/CODEOWNERS")).toBe(true);
    const content = readFile(".github/CODEOWNERS");
    expect(content).toContain("service-role");
  });
});

describe("Risk-9: Cloudflare binding validation", () => {
  it("deploy.yml validates required bindings before deploy", () => {
    const deploy = readFile(".github/workflows/deploy.yml");
    expect(deploy).toContain("RATE_LIMIT_KV");
    expect(deploy).toContain("APP_CACHE_KV");
    expect(deploy).toContain("RATE_LIMITER_DO");
    expect(deploy).toContain("CLICK_QUEUE");
    expect(deploy).toContain("Missing required Cloudflare bindings");
  });

  it("wrangler binding drift test exists", () => {
    expect(fileExists("__tests__/wrangler-binding-drift.test.ts")).toBe(true);
  });
});

describe("Risk-10: Cron secret management", () => {
  it("cron-registry.ts exists with per-trigger secrets", () => {
    expect(fileExists("lib/cron-registry.ts")).toBe(true);
    const content = readFile("lib/cron-registry.ts");
    // Must define per-trigger secrets
    expect(content).toContain("CRON_PUBLISH_SECRET");
    expect(content).toContain("CRON_AI_SECRET");
  });

  it("cron-registry test verifies all secrets are in deploy.yml", () => {
    expect(fileExists("__tests__/cron-registry.test.ts")).toBe(true);
  });

  it("deploy.yml uploads per-trigger cron secrets", () => {
    const deploy = readFile(".github/workflows/deploy.yml");
    expect(deploy).toContain("CRON_PUBLISH_SECRET");
    expect(deploy).toContain("CRON_STRIPE_SYNC_SECRET");
    expect(deploy).toContain("CRON_AI_SECRET");
  });
});

describe("Risk-14: Backup and DR", () => {
  it("DR drill script exists", () => {
    expect(fileExists("scripts/dr-restore-test.sh")).toBe(true);
  });

  it("DR drill workflow exists", () => {
    expect(fileExists(".github/workflows/dr-drill.yml")).toBe(true);
  });

  it("backup-restore-drill workflow exists", () => {
    expect(fileExists(".github/workflows/backup-restore-drill.yml")).toBe(true);
  });

  it("backup policy documentation exists", () => {
    expect(fileExists("docs/BACKUP-POLICY.md")).toBe(true);
  });

  it("DR runbook exists", () => {
    expect(fileExists("docs/DR-RUNBOOK.md")).toBe(true);
  });

  it("rollback workflow exists", () => {
    expect(fileExists(".github/workflows/rollback.yml")).toBe(true);
  });
});

describe("Risk-15: Branch protection", () => {
  it("branch protection ruleset exists", () => {
    expect(fileExists(".github/rulesets/main-protection.json")).toBe(true);
  });

  it("terraform defines branch protection", () => {
    expect(fileExists("terraform/github/branch-protection.tf")).toBe(true);
  });

  it("CI defines required checks gate job", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("Required checks");
    expect(ci).toContain("needs: [check]");
  });
});

describe("Risk-20: R2 bucket isolation", () => {
  it("CI validates R2 buckets are isolated", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("R2_PUBLIC_BUCKET");
    expect(ci).toContain("R2_PRIVATE_BUCKET");
    expect(ci).toContain("same bucket");
  });
});

describe("Risk-22: E2E and load test capability", () => {
  it("Playwright config exists", () => {
    expect(fileExists("playwright.config.ts")).toBe(true);
  });

  it("E2E test directory exists", () => {
    expect(fileExists("e2e")).toBe(true);
  });

  it("load-test script exists", () => {
    expect(fileExists("load-test.js")).toBe(true);
  });

  it("Lighthouse CI config exists", () => {
    expect(fileExists("lighthouserc.cjs")).toBe(true);
  });

  it("Lighthouse workflow exists", () => {
    expect(fileExists(".github/workflows/lighthouse.yml")).toBe(true);
  });

  it("load-test workflow exists", () => {
    expect(fileExists(".github/workflows/load-test.yml")).toBe(true);
  });
});

describe("Risk-23: Sentry observability", () => {
  it("sentry client config exists", () => {
    expect(fileExists("sentry.client.config.ts")).toBe(true);
  });

  it("sentry lib module exists", () => {
    expect(fileExists("lib/sentry.ts")).toBe(true);
  });

  it("terraform defines sentry alerts", () => {
    expect(fileExists("terraform/cloudflare/sentry-alerts.tf")).toBe(true);
  });

  it("alerting runbook exists", () => {
    expect(fileExists("docs/alerting-runbook.md")).toBe(true);
  });

  it("observability runbook exists", () => {
    expect(fileExists("docs/observability-runbook.md")).toBe(true);
  });
});

describe("Risk-24: Cost model documentation", () => {
  it("evidence pack includes cost model section", () => {
    const content = readFile("docs/evidence-pack.md");
    expect(content).toContain("Cost and Vendor Model");
    expect(content).toContain("Cloudflare");
    expect(content).toContain("Supabase");
    expect(content).toContain("Stripe");
    expect(content).toContain("Resend");
    expect(content).toContain("Sentry");
  });
});

describe("Data retention enforcement", () => {
  it("data-retention cron route exists", () => {
    expect(fileExists("app/api/cron/data-retention/route.ts")).toBe(true);
    const content = readFile("app/api/cron/data-retention/route.ts");
    // Must be cron-auth protected
    expect(content).toContain("verifyCronAuth");
    // Must handle affiliate_clicks, audit_log, stripe_events
    expect(content).toContain("affiliate_clicks");
    expect(content).toContain("audit_log");
    expect(content).toContain("stripe_events");
  });

  it("ROPA documentation exists", () => {
    expect(fileExists("docs/ropa.md")).toBe(true);
  });
});

describe("Compliance documentation completeness", () => {
  const requiredDocs = [
    "docs/incident-response.md",
    "docs/secrets-rotation-runbook.md",
    "docs/threat-model.md",
    "docs/vendor-dpas.md",
    "docs/ropa.md",
    "docs/BACKUP-POLICY.md",
    "docs/DR-RUNBOOK.md",
    "docs/slo.md",
    "docs/evidence-pack.md",
    "docs/soc2-controls-mapping.md",
    "docs/architecture-diagram.md",
    "docs/access-recertification.md",
    "docs/compliance-readiness.md",
    "SECURITY.md",
  ];

  for (const doc of requiredDocs) {
    it(`${doc} exists`, () => {
      expect(fileExists(doc)).toBe(true);
    });
  }
});

describe("Rate-limit graceMs abuse protection (Risk-6)", () => {
  it("rate-limit.ts supports per-route graceMs override", () => {
    const content = readFile("lib/rate-limit.ts");
    expect(content).toContain("graceMs");
    // Must use config.graceMs when set
    expect(content).toMatch(/config\.graceMs\s*\?\?/);
  });

  it("rate-limit.ts supports per-route failPolicy", () => {
    const content = readFile("lib/rate-limit.ts");
    expect(content).toContain("failPolicy");
    expect(content).toContain('"closed"');
    expect(content).toContain('"open"');
    expect(content).toContain('"grace"');
  });

  it("rate-limit.ts has Durable Object support for atomic limiting", () => {
    const content = readFile("lib/rate-limit.ts");
    expect(content).toContain("RATE_LIMITER_DO");
    expect(content).toContain("checkRateLimitDO");
    // DO is preferred over KV
    expect(content).toContain("Prefer the Durable Object");
  });

  it("rate-limit.ts has poisoning detection for DO responses", () => {
    const content = readFile("lib/rate-limit.ts");
    expect(content).toContain("isPoisoned");
    expect(content).toContain("Fail closed on a poisoned DO");
  });
});
