/**
 * cron-registry.test.ts
 *
 * Locks down the central cron registry (lib/cron-registry.ts) by
 * asserting every consumer surface stays in sync. P0 #2 in the
 * production-readiness audit identified scattered cron config
 * (wrangler.jsonc, the Worker dispatch table, route handlers,
 * middleware, .env.example) as the largest preventable launch risk;
 * this test fails CI before any of those drift away from the
 * registry.
 */
import { describe, it, expect } from "vitest";
import { validateServerEnv } from "@/lib/server-env";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cronJobs,
  CRON_PATH_PREFIX,
  CRON_FALLBACK_SECRET_ENV,
  getCronJobByPath,
  getCronJobBySchedule,
  getSecretEnvVarsForCronPath,
  getCronAuthOptionsForPath,
  getCronScheduleToPathMap,
  listCronSchedules,
  listLightCronSchedules,
  listAllCronSecretEnvVars,
} from "@/lib/cron-registry";

const REPO_ROOT = join(__dirname, "..");

function readRepoFile(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

/** Strip JSONC line and block comments so JSON.parse can consume it. */
function stripJsonComments(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let stringQuote: '"' | "'" | null = null;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch as '"' | "'";
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  // Remove trailing commas (legal in JSONC, illegal in strict JSON).
  return out.replace(/,(\s*[}\]])/g, "$1");
}

describe("cron-registry — internal invariants", () => {
  it("registers at least one cron job", () => {
    expect(cronJobs.length).toBeGreaterThan(0);
  });

  it("every cron job has a path under CRON_PATH_PREFIX", () => {
    for (const job of cronJobs) {
      expect(job.path.startsWith(CRON_PATH_PREFIX)).toBe(true);
      expect(job.path).toBe(`${CRON_PATH_PREFIX}${job.name}`);
    }
  });

  it("every cron job declares POST as its method", () => {
    for (const job of cronJobs) {
      expect(job.method).toBe("POST");
    }
  });

  it("every cron job is csrfExempt", () => {
    for (const job of cronJobs) {
      expect(job.csrfExempt).toBe(true);
    }
  });

  it("per-trigger secret env vars are unique across jobs", () => {
    const seen = new Set<string>();
    for (const job of cronJobs) {
      expect(seen.has(job.secretEnvVar)).toBe(false);
      seen.add(job.secretEnvVar);
    }
  });

  it("no per-trigger secret collides with CRON_FALLBACK_SECRET_ENV", () => {
    for (const job of cronJobs) {
      expect(job.secretEnvVar).not.toBe(CRON_FALLBACK_SECRET_ENV);
    }
  });

  it("cron schedules are unique", () => {
    const seen = new Set<string>();
    for (const job of cronJobs) {
      expect(seen.has(job.schedule)).toBe(false);
      seen.add(job.schedule);
    }
  });

  it("cron schedules use 5 fields", () => {
    for (const job of cronJobs) {
      const fields = job.schedule.trim().split(/\s+/);
      expect(fields.length).toBe(5);
    }
  });
});

describe("cron-registry — helpers", () => {
  it("getCronJobByPath round-trips for every job", () => {
    for (const job of cronJobs) {
      expect(getCronJobByPath(job.path)).toBe(job);
    }
  });

  it("getCronJobBySchedule round-trips for every job", () => {
    for (const job of cronJobs) {
      expect(getCronJobBySchedule(job.schedule)).toBe(job);
    }
  });

  it("getSecretEnvVarsForCronPath returns per-trigger then fallback", () => {
    for (const job of cronJobs) {
      expect(getSecretEnvVarsForCronPath(job.path)).toEqual([
        job.secretEnvVar,
        CRON_FALLBACK_SECRET_ENV,
      ]);
    }
  });

  it("getSecretEnvVarsForCronPath throws on unknown paths", () => {
    expect(() => getSecretEnvVarsForCronPath("/api/cron/does-not-exist")).toThrow();
  });

  it("getCronAuthOptionsForPath wraps secretEnvVars in an options object", () => {
    for (const job of cronJobs) {
      expect(getCronAuthOptionsForPath(job.path)).toEqual({
        secretEnvVars: [job.secretEnvVar, CRON_FALLBACK_SECRET_ENV],
      });
    }
  });

  it("getCronScheduleToPathMap covers every job", () => {
    const map = getCronScheduleToPathMap();
    expect(Object.keys(map).length).toBe(cronJobs.length);
    for (const job of cronJobs) {
      expect(map[job.schedule]).toBe(job.path);
    }
  });

  it("listCronSchedules returns the same set as cronJobs", () => {
    const schedules = listCronSchedules();
    expect(schedules.length).toBe(cronJobs.length);
    expect(new Set(schedules)).toEqual(new Set(cronJobs.map((j) => j.schedule)));
  });

  it("listAllCronSecretEnvVars includes the fallback once", () => {
    const all = listAllCronSecretEnvVars();
    expect(all).toContain(CRON_FALLBACK_SECRET_ENV);
    expect(all.filter((n) => n === CRON_FALLBACK_SECRET_ENV).length).toBe(1);
    for (const job of cronJobs) {
      expect(all).toContain(job.secretEnvVar);
    }
  });
});

describe("cron-registry — wrangler.jsonc consistency", () => {
  const wranglerJson = readRepoFile("wrangler.jsonc");
  const wrangler = JSON.parse(stripJsonComments(wranglerJson)) as {
    triggers?: { crons?: string[] };
    env?: { staging?: { triggers?: { crons?: string[] } } };
  };

  it("wrangler.jsonc parses as JSONC", () => {
    expect(wrangler).toBeTruthy();
    expect(wrangler.triggers?.crons).toBeInstanceOf(Array);
  });

  it("wrangler triggers.crons matches the registry's light jobs exactly (no drift)", () => {
    // A-018: Heavy crons run on the dedicated affilite-mix-heavy-crons worker
    // and are intentionally NOT present in this Worker's wrangler.jsonc.
    // Compare wrangler.jsonc against light schedules only.
    const wranglerCrons = wrangler.triggers?.crons ?? [];
    const lightCrons = listLightCronSchedules();
    expect(new Set(wranglerCrons)).toEqual(new Set(lightCrons));
    expect(wranglerCrons.length).toBe(lightCrons.length);
  });

  it("staging env triggers.crons matches the registry's light jobs exactly (H1 — no drift)", () => {
    // H1: the staging main worker uses the same exact-match dispatcher as
    // production. Staging-only schedules that don't exist in the registry
    // silently dispatched the wrong job (or nothing at all). Staging must
    // use the exact registry light schedules. Heavy jobs run on the separate
    // heavy-crons worker, which has no staging environment.
    const stagingCrons = wrangler.env?.staging?.triggers?.crons ?? [];
    const lightCrons = listLightCronSchedules();
    expect(new Set(stagingCrons)).toEqual(new Set(lightCrons));
    expect(stagingCrons.length).toBe(lightCrons.length);
    // Every staging schedule must resolve to a real, non-heavy registry job.
    for (const schedule of stagingCrons) {
      const job = getCronJobBySchedule(schedule);
      expect(job, `staging schedule "${schedule}" has no registry entry`).toBeTruthy();
      expect(job?.heavy ?? false).toBe(false);
    }
  });

  it("wrangler.heavy-crons.jsonc triggers.crons matches the registry's heavy jobs exactly", () => {
    // A-018: heavy jobs run on the dedicated dispatcher worker. Its schedule
    // list must equal exactly the `heavy: true` registry schedules, or heavy
    // jobs either never fire or a heavy schedule leaks onto the main worker.
    const heavyJson = readRepoFile("wrangler.heavy-crons.jsonc");
    const heavy = JSON.parse(stripJsonComments(heavyJson)) as {
      triggers?: { crons?: string[] };
    };
    const heavyCrons = heavy.triggers?.crons ?? [];
    const heavySchedules = cronJobs.filter((j) => j.heavy).map((j) => j.schedule);
    expect(heavySchedules.length).toBeGreaterThan(0);
    expect(new Set(heavyCrons)).toEqual(new Set(heavySchedules));
    expect(heavyCrons.length).toBe(heavySchedules.length);
    for (const schedule of heavyCrons) {
      const job = getCronJobBySchedule(schedule);
      expect(job, `heavy schedule "${schedule}" has no registry entry`).toBeTruthy();
      expect(job?.heavy ?? false).toBe(true);
    }
  });
});

describe("cron-registry — route handler consistency", () => {
  it("every registered cron path has a route handler that uses the registry helper", () => {
    for (const job of cronJobs) {
      const routePath = `app${job.path}/route.ts`;
      const routeSrc = readRepoFile(routePath);
      // Route must call the registry-derived helper rather than hard-coding env names.
      expect(routeSrc).toMatch(new RegExp(`getCronAuthOptionsForPath\\(\\s*"${job.path}"\\s*\\)`));
      // Route must not silently fall back to verifyCronAuth() with no options
      // (which would only accept CRON_SECRET and bypass per-trigger rotation).
      expect(routeSrc).not.toMatch(/verifyCronAuth\(\s*request\s*\)/);
    }
  });
});

describe("cron-registry — middleware CSRF exemption", () => {
  it("middleware exempts the cron path prefix from CSRF", () => {
    // F-007: CSRF extracted to lib/middleware/csrf; middleware delegates via
    // withCsrf. The cron-prefix exemption now lives in the module.
    const middlewareSrc = readRepoFile("middleware.ts");
    expect(middlewareSrc).toMatch(/withCsrf\(/);
    const csrfModule = readRepoFile("lib/middleware/csrf.ts");
    expect(csrfModule).toMatch(/CRON_PATH_PREFIX/);
    expect(csrfModule).toMatch(/startsWith\(\s*CRON_PATH_PREFIX\s*\)/);
  });
});

describe("cron-registry — deploy.yml secret upload coverage (NEW-001)", () => {
  // The Set Worker secrets / Set heavy-crons Worker secrets steps in
  // deploy.yml are the only place per-trigger cron secrets actually
  // reach the running Workers. If a secret is added to the registry
  // but not to deploy.yml, the production Worker either crashes on
  // boot (instrumentation.ts checks REQUIRED_SERVER_ENV which is now
  // derived from cronJobs) or silently 401s every cron request
  // (verifyCronAuth rejects the shared CRON_SECRET fallback in prod).
  // This guard fails CI before either failure mode reaches production.
  const deployYml = readRepoFile(".github/workflows/deploy.yml");

  it("validates every per-trigger secret in the Set Worker secrets MISSING check", () => {
    for (const job of cronJobs) {
      // The validation block uses bash variables of the shape
      // `[ -z "$_FOO" ] && MISSING="$MISSING <SECRET_NAME>"`. We
      // assert the secret name appears as a MISSING-list entry so a
      // missing GitHub Actions secret fails the deploy fast.
      const re = new RegExp(`MISSING=\\"\\$MISSING ${job.secretEnvVar}\\"`);
      expect(deployYml).toMatch(re);
    }
  });

  it("uploads every per-trigger secret to the affilite-mix worker", () => {
    for (const job of cronJobs) {
      const re = new RegExp(
        `wrangler@\\$\\{WRANGLER_VERSION\\} secret put ${job.secretEnvVar}\\b[^\\n]*--name affilite-mix\\b`,
      );
      expect(deployYml).toMatch(re);
    }
  });

  it("uploads CRON_HOST and every heavy-job per-trigger secret to the affilite-mix-heavy-crons worker", () => {
    // Least-privilege (deploy commit 9242162): the heavy-crons dispatcher
    // only fires jobs flagged `heavy: true` in the registry — currently
    // ai-generate, commission-ingest and price-scrape. At trigger time it
    // reads CRON_HOST plus the per-trigger secret for the job that fired,
    // so deploy.yml uploads exactly CRON_HOST + the heavy-job secrets, not
    // the main worker's full set. This guard keeps the heavy-crons secret
    // list in lock-step with the `heavy` flags in cron-registry.ts.
    expect(deployYml).toMatch(
      /wrangler@\$\{WRANGLER_VERSION\} secret put CRON_HOST\b[^\n]*--name "?affilite-mix-heavy-crons"?/,
    );
    const heavyJobs = cronJobs.filter((job) => job.heavy);
    expect(heavyJobs.length).toBeGreaterThan(0);
    for (const job of heavyJobs) {
      const re = new RegExp(
        `wrangler@\\$\\{WRANGLER_VERSION\\} secret put ${job.secretEnvVar}\\b[^\\n]*--name "?affilite-mix-heavy-crons"?`,
      );
      expect(deployYml).toMatch(re);
    }
  });

  it("does not push non-heavy per-trigger secrets to the heavy-crons worker (least-privilege)", () => {
    // Minimise blast radius: secrets for jobs that never run on heavy-crons
    // must not be uploaded to it. If a job is later flagged `heavy: true`,
    // add its secret to the heavy-crons deploy step in the same change.
    for (const job of cronJobs.filter((job) => !job.heavy)) {
      const re = new RegExp(
        `secret put ${job.secretEnvVar}\\b[^\\n]*--name "?affilite-mix-heavy-crons"?`,
      );
      expect(deployYml).not.toMatch(re);
    }
  });
});

describe("cron-registry — server-env production conditional (NEW-001)", () => {
  // server-env.ts derives its production cron-secret requirements
  // directly from cronJobs. Missing values throw at boot via
  // instrumentation.ts. This guard locks that wiring so a future
  // refactor cannot quietly drop the registry import.
  it("every per-trigger secret is reported missing when prod env is bare", () => {
    const env = process.env as Record<string, string | undefined>;
    const originalNodeEnv = env.NODE_ENV;
    const originalSecrets = new Map<string, string | undefined>();
    for (const job of cronJobs) {
      originalSecrets.set(job.secretEnvVar, env[job.secretEnvVar]);
    }
    try {
      for (const job of cronJobs) {
        delete env[job.secretEnvVar];
      }
      env.NODE_ENV = "production";
      const { missing } = validateServerEnv();
      const missingNames = new Set(missing.map((m) => m.name));
      for (const job of cronJobs) {
        expect(missingNames.has(job.secretEnvVar)).toBe(true);
      }
    } finally {
      env.NODE_ENV = originalNodeEnv;
      for (const [name, value] of originalSecrets) {
        if (value === undefined) delete env[name];
        else env[name] = value;
      }
    }
  });
});

describe("cron-registry — .env.example documentation", () => {
  const envExample = readRepoFile(".env.example");

  it("documents every per-trigger secret env var", () => {
    for (const job of cronJobs) {
      // Each per-trigger secret must appear as a top-level "NAME=" assignment
      // in .env.example so operators don't silently miss configuring it.
      const re = new RegExp(`^${job.secretEnvVar}=`, "m");
      expect(envExample).toMatch(re);
    }
  });

  it("documents the shared fallback CRON_SECRET", () => {
    const re = new RegExp(`^${CRON_FALLBACK_SECRET_ENV}=`, "m");
    expect(envExample).toMatch(re);
  });

  it("does not advertise pooler URLs as the value of NEXT_PUBLIC_SUPABASE_URL (P0 #1)", () => {
    // The misleading guidance was: 'use the pooler URL for NEXT_PUBLIC_SUPABASE_URL
    // in production'. Pooler URLs are postgres connection strings, not REST API URLs.
    // The replacement comment must explicitly call out the distinction.
    expect(envExample).toMatch(/NEXT_PUBLIC_SUPABASE_URL must always be the Supabase REST API URL/);
    expect(envExample).toMatch(/Do NOT use a pooler URL here/);
  });
});

describe("cron-registry — CI server boot secret coverage", () => {
  const ciWorkflow = readRepoFile(".github/workflows/ci.yml");
  const lighthouseWorkflow = readRepoFile(".github/workflows/lighthouse.yml");
  const mutationWorkflow = readRepoFile(".github/workflows/mutation.yml");

  it("provides affiliate cron secrets to booting CI workflows", () => {
    for (const job of cronJobs.filter((entry) => entry.name.startsWith("affiliate-"))) {
      expect(ciWorkflow, `${job.secretEnvVar} missing from CI workflow`).toMatch(
        new RegExp(`^\\s*${job.secretEnvVar}:`, "m"),
      );
      expect(lighthouseWorkflow, `${job.secretEnvVar} missing from Lighthouse workflow`).toMatch(
        new RegExp(`^\\s*${job.secretEnvVar}:`, "m"),
      );
      expect(mutationWorkflow, `${job.secretEnvVar} missing from mutation workflow`).toMatch(
        new RegExp(`^\\s*${job.secretEnvVar}:`, "m"),
      );
    }
  });
});
