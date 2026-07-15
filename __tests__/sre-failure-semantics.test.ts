/**
 * SRE failure-semantics regression locks (audit findings P0-3, P1-3, P1-4, P1-5).
 *
 * These guard the fixes that make missing/unsafe operational verification
 * FAIL CLEARLY instead of silently reporting success:
 *
 *   P1-3  automated down-migration rollback refuses irreversible / placeholder
 *         down files instead of executing a no-op and claiming success.
 *   P1-4  post-deploy health / secret / cron gates fail closed.
 *   P1-5  heavy-cron liveness sweep is not solely dependent on the publish cron.
 *   P0-3  the backup restore drill validates the RESTORED schema, not the live one.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

/** Run the classifier; returns { code, stdout }. */
function classify(downFileRel: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("bash", ["scripts/classify-migration-rollback.sh", downFileRel], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("P1-3: classify-migration-rollback.sh", () => {
  it("classifies a real reversal (DROP INDEX) as auto (exit 0)", () => {
    const r = classify("supabase/migrations-down/00076_deals_site_id_index-down.sql");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^auto:/);
  });

  it("classifies a `-- NO DOWN` placeholder as manual (exit 3)", () => {
    const r = classify("supabase/migrations-down/00003_rls_defense_in_depth-down.sql");
    expect(r.code).toBe(3);
    expect(r.stdout).toMatch(/^manual:/);
  });

  it("classifies a forward-only / not-reversible down file as manual", () => {
    const r = classify("supabase/migrations-down/00098_enforce_timestamptz-down.sql");
    expect(r.code).toBe(3);
  });

  it("classifies a down file carrying a DATA LOSS warning as manual", () => {
    const r = classify("supabase/migrations-down/00099_fix_A26_A30_audit_findings-down.sql");
    expect(r.code).toBe(3);
  });

  it("treats a missing down file as manual (never silently auto-runs)", () => {
    const r = classify("supabase/migrations-down/does-not-exist-down.sql");
    expect(r.code).toBe(3);
  });
});

describe("P1-3: deploy.yml automated rollback is classification-gated", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const start = deploy.indexOf("rollback-migrations:");
  const block = deploy.slice(start);

  it("invokes the classifier before running any down file", () => {
    expect(block).toContain("scripts/classify-migration-rollback.sh");
  });

  it("refuses the automated path for non-auto-safe migrations", () => {
    expect(block).toContain("Refusing automatic rollback");
    expect(block).toContain("docs/DR-RUNBOOK.md");
  });
});

describe("P1-4: post-deploy health gate fails closed on a Cloudflare challenge", () => {
  const deploy = read(".github/workflows/deploy.yml");

  it("has a documented, non-default bypass and errors otherwise", () => {
    expect(deploy).toContain("ALLOW_HEALTH_CHALLENGE_BYPASS");
    // The challenge branch must be able to hard-fail (exit 1), not always exit 0.
    const idx = deploy.indexOf("the probe never reached the application");
    expect(idx).toBeGreaterThan(-1);
    const window = deploy.slice(idx, idx + 400);
    expect(window).toContain("exit 1");
  });
});

describe("P1-4: secret and cron drift gates are blocking", () => {
  const deploy = read(".github/workflows/deploy.yml");

  function stepBlock(name: string): string {
    const s = deploy.indexOf(`- name: ${name}`);
    expect(s).toBeGreaterThan(-1);
    const e = deploy.indexOf("\n      - name:", s + 1);
    return deploy.slice(s, e === -1 ? undefined : e);
  }

  it("Worker secret drift is not continue-on-error and requires the API token", () => {
    const b = stepBlock("Runtime drift — Worker secrets");
    expect(b).not.toContain("continue-on-error: true");
    expect(b).toContain("required for the live Worker secret drift gate");
    expect(b).toContain("exit 1");
  });

  it("Cron schedule drift is not continue-on-error and requires the API token", () => {
    const b = stepBlock("Runtime drift — Cron schedules");
    expect(b).not.toContain("continue-on-error: true");
    expect(b).toContain("required for the live cron schedule drift gate");
    expect(b).toContain("exit 1");
  });
});

describe("P1-5: liveness sweep is not solely dependent on the publish cron", () => {
  it("click-reconcile also runs checkCronLiveness (shared-fate mitigation)", () => {
    const route = read("app/api/cron/click-reconcile/route.ts");
    expect(route).toContain("checkCronLiveness");
    expect(route).toMatch(
      /import\s*\{[^}]*checkCronLiveness[^}]*\}\s*from\s*["']@\/lib\/cron-liveness["']/,
    );
  });
});

describe("P0-3: backup restore drill validates the RESTORED schema", () => {
  const wf = read(".github/workflows/backup-restore-drill.yml");
  const drill = read("scripts/dr-drill.sh");

  it("keeps dr_test and validates it, then cleans up", () => {
    expect(wf).toContain('DR_KEEP_SCHEMA: "1"');
    expect(wf).toContain("table_schema = 'dr_test'");
    expect(wf).toContain("schemaname = 'dr_test'");
    expect(wf).toContain("DROP SCHEMA IF EXISTS dr_test CASCADE");
  });

  it("dr-drill.sh honors DR_KEEP_SCHEMA to leave the restored schema in place", () => {
    expect(drill).toContain("DR_KEEP_SCHEMA");
  });
});
