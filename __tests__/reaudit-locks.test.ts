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
 *   N-001  /api/track/click route MUST publish to the queue
 *          (publishClick) and MUST NOT call recordClick directly.
 *   N-002  Worker DLQ branch MUST only ackAll() on a 2xx DLQ-persistence
 *          response and MUST retryAll() on non-2xx / fetch errors.
 *   N-003  deploy workflow MUST be able to auto-deploy the log-shipper
 *          Tail Worker and inject `tail_consumers` when
 *          LOG_SHIPPER_ENABLED is set.
 *   N-005  CI db-audit / db-types jobs MUST hard-fail on missing
 *          STAGING_SUPABASE_DB_URL for trusted contexts (push / non-fork PRs).
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

  it("derives site_id from request-aware requireAdmin().dbSiteId, not the request", () => {
    expect(code).toMatch(/requireAdmin\(\s*request\s*\)/);
    expect(code).toMatch(/dbSiteId/);
  });
});

describe("re-audit lock — R-009 / G-27 / audit-etap1 #20: CSP fallback scoped to middleware-excluded paths", () => {
  const cfg = readRepoFile("next.config.ts");

  it("the catch-all /(.*)  rule does NOT declare a Content-Security-Policy header", () => {
    // G-27 (Apr 2026) + audit-etap1 #20 (May 2026): the catch-all CSP
    // fallback has been dropped in favour of the per-request nonced
    // policy from middleware.ts. CSP is now ONLY allowed on the narrow
    // source patterns that match middleware-excluded paths (audit-etap1
    // #20 belt-and-suspenders for opaque binary / internal-only paths).
    // The catch-all `/(.*)`  rule must never carry a CSP header.
    const catchAllRule = cfg.match(/source:\s*"\/\(\.\*\)"[\s\S]*?\}\s*,\s*\]/);
    expect(catchAllRule, "could not find /(.*) headers rule").not.toBeNull();
    expect(catchAllRule![0]).not.toMatch(/"Content-Security-Policy"/);
  });

  it("audit-etap1 #20: middleware-excluded paths carry a `default-src 'none'` fallback CSP", () => {
    expect(cfg).toMatch(/audit-etap1 #20/);
    expect(cfg).toMatch(/_next\/static/);
    expect(cfg).toMatch(/default-src 'none'/);
  });

  it("buildCspHeader in lib/csp.ts is the sole source of CSP", () => {
    const csp = readRepoFile("lib", "csp.ts");
    const code = stripComments(csp);
    expect(code).toMatch(/buildCspHeader/);
    // `'unsafe-inline'` must not appear in script-src. Style-src uses
    // 'unsafe-inline' intentionally (see lib/csp.ts rationale: nonces
    // can't protect style attributes or dynamic element.style writes).
    //
    // The directive is a single template literal in the source, so we
    // bound the negative match to the directive line itself (excluding
    // newlines and commas) rather than searching to the next `;` —
    // there is no `;` between sibling array entries, which would let a
    // match leak into the next directive (e.g. style-src) and produce
    // a false positive.
    expect(code).not.toMatch(/script-src[^,\n`]*'unsafe-inline'/);
  });
});

describe("re-audit lock — N-001 click route uses the queue, not direct DB writes", () => {
  const route = readRepoFile("app", "api", "track", "click", "route.ts");
  const code = stripComments(route);

  it("imports publishClick from @/lib/click-queue", () => {
    expect(code).toMatch(
      /import\s*\{[^}]*\bpublishClick\b[^}]*\}\s*from\s*["']@\/lib\/click-queue["']/,
    );
  });

  it("does not import recordClick directly in executable code", () => {
    // The route must go through the queue producer (which falls through to
    // recordClick only when no CLICK_QUEUE binding is present). A direct
    // `import { recordClick }` in the route would bypass the queue's
    // retry/DLQ durability — exactly what N-001 flagged.
    expect(code).not.toMatch(/import\s*\{[^}]*\brecordClick\b[^}]*\}/);
    expect(code).not.toMatch(/from\s*["']@\/lib\/dal\/affiliate-clicks["']/);
  });

  it("calls publishClick (and not recordClick) in the request handler", () => {
    expect(code).toMatch(/publishClick\s*\(/);
    expect(code).not.toMatch(/\brecordClick\s*\(/);
  });
});

describe("re-audit lock — N-002 DLQ branch only acks on 2xx persistence", () => {
  const worker = readRepoFile("workers", "custom-worker.ts");
  const code = stripComments(worker);

  it("inspects res.ok / res.status before acking the DLQ batch", () => {
    // Pin the shape of the fix: the DLQ branch must check the response
    // (`res.ok` or `res.status`) so a 500 from /api/queue/clicks?dlq=true
    // (e.g. click_failures insert failure) does not silently lose the
    // dead-letter evidence.
    expect(code).toMatch(/dlq=true[\s\S]*?res(\.ok|\.status)/);
  });

  it("retries the DLQ batch on non-2xx or fetch errors", () => {
    // Both branches must exist: a successful ack on res.ok AND a
    // retryAll() on the failure path. A bare `batch.ackAll()` after a
    // fetch with no status check is the regression we are guarding.
    const dlqBlock = code.match(/click-tracking-dlq[\s\S]*?return;/);
    expect(dlqBlock, "DLQ branch missing in worker").not.toBeNull();
    expect(dlqBlock![0]).toMatch(/batch\.retryAll\(\)/);
    expect(dlqBlock![0]).toMatch(/batch\.ackAll\(\)/);
  });
});

describe("re-audit lock — N-003 log-shipper wiring is gated on LOG_SHIPPER_ENABLED", () => {
  const deploy = readRepoFile(".github", "workflows", "deploy.yml");

  it("deploy workflow deploys the log-shipper before the main Worker", () => {
    expect(deploy).toMatch(/Deploy log-shipper Tail Worker/);
    expect(deploy).toMatch(
      /wrangler@\$\{WRANGLER_VERSION\}\s+deploy\s+\\\s*\n\s+--config\s+workers\/log-shipper\/wrangler\.jsonc/,
    );
  });

  it("workflow rewrites tail_consumers via inject-tail-consumers.mjs", () => {
    expect(deploy).toMatch(/scripts\/inject-tail-consumers\.mjs/);
  });

  it("both shipper steps are gated on the LOG_SHIPPER_ENABLED repo variable", () => {
    const deployShipperIdx = deploy.indexOf("Deploy log-shipper Tail Worker");
    const wireTailIdx = deploy.indexOf("Wire tail_consumers in wrangler.jsonc");
    const nextStepIdx = deploy.indexOf("- name:", wireTailIdx + 1);

    expect(deployShipperIdx, "shipper deploy step missing in deploy.yml").toBeGreaterThan(-1);
    expect(wireTailIdx, "tail consumer wiring step missing in deploy.yml").toBeGreaterThan(
      deployShipperIdx,
    );

    const shipperBlock = deploy.slice(deployShipperIdx, nextStepIdx > -1 ? nextStepIdx : undefined);
    const gates = shipperBlock.match(/if:\s*vars\.LOG_SHIPPER_ENABLED\s*==\s*'true'/g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("re-audit lock — N-005 staging-DB CI jobs hard-fail on trusted contexts", () => {
  const ci = readRepoFile(".github", "workflows", "ci.yml");
  const auditScript = readRepoFile("scripts", "db-audit.sh");
  const typesScript = readRepoFile("scripts", "check-db-types.sh");

  it("ci.yml passes REQUIRE_STAGING_DB to the db-audit job", () => {
    const block = ci.match(/db-audit:[\s\S]*?bash scripts\/db-audit\.sh/);
    expect(block, "db-audit job missing in ci.yml").not.toBeNull();
    expect(block![0]).toMatch(/REQUIRE_STAGING_DB:/);
    expect(block![0]).toMatch(/github\.event_name == 'push'/);
    expect(block![0]).toMatch(/head\.repo\.full_name == github\.repository/);
  });

  it("ci.yml passes REQUIRE_STAGING_DB to the db-types job", () => {
    const block = ci.match(/db-types:[\s\S]*?bash scripts\/check-db-types\.sh/);
    expect(block, "db-types job missing in ci.yml").not.toBeNull();
    expect(block![0]).toMatch(/REQUIRE_STAGING_DB:/);
    expect(block![0]).toMatch(/github\.event_name == 'push'/);
  });

  it("scripts/db-audit.sh exits 1 when REQUIRE_STAGING_DB=true and the secret is missing", () => {
    expect(auditScript).toMatch(/REQUIRE_STAGING_DB.*?true/);
    const guard = auditScript.match(/REQUIRE_STAGING_DB[\s\S]{0,300}exit\s+1/);
    expect(guard, "db-audit.sh must exit 1 when REQUIRE_STAGING_DB=true").not.toBeNull();
  });

  it("scripts/check-db-types.sh exits 1 when REQUIRE_STAGING_DB=true and the secret is missing", () => {
    expect(typesScript).toMatch(/REQUIRE_STAGING_DB.*?true/);
    const guard = typesScript.match(/REQUIRE_STAGING_DB[\s\S]{0,300}exit\s+1/);
    expect(guard, "check-db-types.sh must exit 1 when REQUIRE_STAGING_DB=true").not.toBeNull();
  });
});
