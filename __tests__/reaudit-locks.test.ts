/**
 * Regression locks for the re-audit verdicts the repo has *already*
 * remediated, so a future change cannot quietly reintroduce any of
 * them. Each block targets a specific re-audit finding and pins the
 * shape of the fix at the file level.
 *
 * Findings covered:
 *   R-001  Worker cron dispatcher must read from lib/cron-registry.
 *   R-002  Worker must export an `async queue(...)` consumer.
 *   R-003  Main deploy workflow must NOT contain admin-bootstrap.
 *   R-005  Production deploy must hard-fail if STAGING_SUPABASE_DB_URL
 *          is missing (no skip-with-success path).
 *   R-006  SUPABASE_JWT_SECRET must be in .env.example AND health
 *          required-var list AND deploy validation.
 *   R-007  lib/authz.ts must never call request.nextUrl.searchParams
 *          .get("site_id") in executable code paths.
 *   R-009  next.config.ts CSP fallback must NOT contain 'unsafe-inline'
 *          for script-src or style-src.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRepoFile(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

/** Strip JS/TS line + block comments so we can grep executable code only. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("re-audit lock — R-001 cron dispatcher uses registry", () => {
  const worker = readRepoFile("workers", "custom-worker.ts");

  it("imports getCronJobBySchedule from lib/cron-registry", () => {
    expect(worker).toMatch(/getCronJobBySchedule/);
    expect(worker).toMatch(/from\s+["']\.\.\/lib\/cron-registry["']/);
  });

  it("does not hardcode /api/cron/publish in the dispatch path", () => {
    // The literal string only appears in the registry, not in the
    // worker dispatch fallback. Allow it to appear inside a comment
    // (we strip comments first) but never in executable code.
    const code = stripComments(worker);
    const matches = code.match(/\/api\/cron\/publish/g) ?? [];
    expect(
      matches.length,
      `cron dispatcher must not hardcode /api/cron/publish (executable matches=${matches.length})`,
    ).toBe(0);
  });

  it("dispatches via job.path resolved from controller.cron", () => {
    const code = stripComments(worker);
    expect(code).toMatch(/getCronJobBySchedule\(\s*controller\.cron\s*\)/);
    expect(code).toMatch(/const\s+path\s*=\s*job\.path/);
  });
});

describe("re-audit lock — R-002 Worker queue consumer", () => {
  const worker = readRepoFile("workers", "custom-worker.ts");

  it("exports an async queue(batch, env, ctx) handler", () => {
    expect(worker).toMatch(/async\s+queue\s*\(\s*batch\s*:/);
  });

  it("forwards click-tracking batches to /api/queue/clicks", () => {
    const code = stripComments(worker);
    expect(code).toMatch(/click-tracking/);
    expect(code).toMatch(/\/api\/queue\/clicks/);
  });

  it("acks unknown queues so they don't loop forever", () => {
    expect(worker).toMatch(/batch\.ackAll\(\)/);
  });
});

describe("re-audit lock — R-003 main deploy is not the admin bootstrap", () => {
  const deploy = readRepoFile(".github", "workflows", "deploy.yml");
  const bootstrap = readRepoFile(".github", "workflows", "admin-bootstrap.yml");

  it("deploy.yml does not insert into admin_users", () => {
    expect(deploy).not.toMatch(/INSERT\s+INTO\s+admin_users/i);
    expect(deploy).not.toMatch(/ADMIN_BOOTSTRAP_PASSWORD/);
    expect(deploy).not.toMatch(/ADMIN_BOOTSTRAP_EMAIL/);
  });

  it("admin-bootstrap.yml is workflow_dispatch only (manual trigger)", () => {
    // Manual trigger is the only `on:` entry — no `push`, `pull_request`,
    // or `schedule`. We assert the absence of automatic triggers and
    // the presence of workflow_dispatch.
    expect(bootstrap).toMatch(/workflow_dispatch:/);
    expect(bootstrap).not.toMatch(/^\s*push:/m);
    expect(bootstrap).not.toMatch(/^\s*pull_request:/m);
    expect(bootstrap).not.toMatch(/^\s*schedule:/m);
  });
});

describe("re-audit lock — R-005 staging DB validation is mandatory", () => {
  const deploy = readRepoFile(".github", "workflows", "deploy.yml");

  it("errors and exits non-zero when STAGING_SUPABASE_DB_URL is missing", () => {
    expect(deploy).toMatch(/STAGING_SUPABASE_DB_URL is required for production deploy/);
    // The same conditional must `exit 1` — not warn-and-continue.
    const block = deploy.match(/STAGING_SUPABASE_DB_URL is required[\s\S]{0,300}exit\s+1/);
    expect(block, "missing-staging-secret block must exit 1").not.toBeNull();
  });

  it("refuses to reset a database whose URL equals SUPABASE_DB_URL", () => {
    expect(deploy).toMatch(/refusing to reset production database/);
  });
});

describe("re-audit lock — R-006 SUPABASE_JWT_SECRET coverage", () => {
  const env = readRepoFile(".env.example");
  const health = readRepoFile("app", "api", "health", "route.ts");
  const deploy = readRepoFile(".github", "workflows", "deploy.yml");

  it(".env.example documents SUPABASE_JWT_SECRET", () => {
    expect(env).toMatch(/^SUPABASE_JWT_SECRET=/m);
  });

  it("/api/health required-vars list contains SUPABASE_JWT_SECRET", () => {
    expect(health).toMatch(/"SUPABASE_JWT_SECRET"/);
  });

  it("deploy.yml validates SUPABASE_JWT_SECRET before deploying", () => {
    expect(deploy).toMatch(/_SUPABASE_JWT_SECRET:\s*\$\{\{\s*secrets\.SUPABASE_JWT_SECRET\s*\}\}/);
    expect(deploy).toMatch(/SUPABASE_JWT_SECRET\s*--name affilite-mix/);
  });
});

describe("re-audit lock — R-007 withAuthz reads site from server context only", () => {
  const authz = readRepoFile("lib", "authz.ts");
  const code = stripComments(authz);

  it("does not call searchParams.get('site_id') in executable code", () => {
    expect(code).not.toMatch(/searchParams\.get\(\s*["']site_id["']\s*\)/);
  });

  it("derives site_id from requireAdmin().dbSiteId, not the request", () => {
    expect(code).toMatch(/requireAdmin\(\)/);
    expect(code).toMatch(/dbSiteId/);
  });
});

describe("re-audit lock — R-009 static CSP fallback rejects unsafe-inline", () => {
  const cfg = readRepoFile("next.config.ts");

  it("script-src does not include 'unsafe-inline'", () => {
    const m = cfg.match(/"script-src[^"]*"/);
    expect(m, "script-src directive missing").not.toBeNull();
    expect(m![0]).not.toMatch(/unsafe-inline/);
  });

  it("style-src does not include 'unsafe-inline'", () => {
    const m = cfg.match(/"style-src[^"]*"/);
    expect(m, "style-src directive missing").not.toBeNull();
    expect(m![0]).not.toMatch(/unsafe-inline/);
  });
});
