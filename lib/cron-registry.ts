/**
 * Single source of truth for Cloudflare cron triggers.
 *
 * Every scheduled job declares its name, cron schedule, route path,
 * HTTP method, secret-rotation list, CSRF posture, and alerting hint
 * here. Five different surfaces all derive their behaviour from this
 * registry instead of carrying their own copy:
 *
 *   1. wrangler.jsonc                 ΓÇö `triggers.crons` schedule list
 *   2. workers/custom-worker.ts       ΓÇö schedule -> path dispatch table
 *   3. app/api/cron/<name>/route.ts   ΓÇö verifyCronAuth secretEnvVars
 *   4. middleware.ts                  ΓÇö CSRF exempt prefix
 *   5. .env.example                   ΓÇö documented per-trigger secrets
 *
 * Drift between any of those surfaces was the largest preventable cron
 * risk surfaced in the production-readiness audit (P0 #2). The
 * `__tests__/cron-registry.test.ts` suite asserts that wrangler,
 * .env.example, the routes, and the middleware all stay in sync with
 * this list ΓÇö a missing or extra entry fails CI before deploy.
 *
 * Adding a new cron job:
 *   1. Append a `CronJob` entry below.
 *   2. Add a route at `app/api/cron/<name>/route.ts` that calls
 *      `verifyCronAuth(request, getCronAuthOptionsForPath(...))`.
 *   3. Add the schedule to `wrangler.jsonc -> triggers.crons`.
 *   4. Document the per-trigger secret in `.env.example`.
 *   5. Run `npm test -- cron-registry` to verify everything matches.
 *
 * This module is plain data + helpers with no Next.js or runtime
 * dependencies, so it is safe to import from the Cloudflare Worker
 * entry, route handlers, scripts, and tests alike.
 */

export const CRON_PATH_PREFIX = "/api/cron/" as const;

/**
 * Shared fallback secret env var. Every per-trigger secret list ends
 * with this name so operators can roll out per-trigger secrets
 * incrementally without breaking running deployments.
 */
export const CRON_FALLBACK_SECRET_ENV = "CRON_SECRET" as const;

export interface CronJob {
  /** Human-readable identifier; matches the route segment. */
  readonly name: string;
  /** Cron expression in standard 5-field format. */
  readonly schedule: string;
  /** Absolute API path the Worker POSTs to. Always under CRON_PATH_PREFIX. */
  readonly path: string;
  /** HTTP method the Worker uses to invoke the route. */
  readonly method: "POST";
  /**
   * Ordered list of env-var names accepted as a Bearer secret. The
   * dedicated per-trigger secret comes first; CRON_FALLBACK_SECRET_ENV
   * is appended automatically by the registry helpers so each entry
   * here only needs to list the per-trigger secret.
   */
  readonly secretEnvVar: string;
  /**
   * Whether this route is exempt from the CSRF double-submit check.
   * All cron routes are exempt because they authenticate via Bearer
   * secret, not via cookies; the field is kept explicit so the
   * registry test can assert middleware coverage.
   */
  readonly csrfExempt: true;
  /**
   * Whether failures should fan out to alerting (Sentry/Cloudflare).
   * `true` for jobs whose silent failure would cause user-visible or
   * revenue-impacting drift; `false` for low-stakes housekeeping.
   */
  readonly alertOnFailure: boolean;
  /** Brief description for documentation / alert payloads. */
  readonly description: string;
  /**
   * A-018: Whether this job is "heavy" (long-running, high CPU, or many
   * external API calls). Heavy jobs are split into a separate Worker so
   * they cannot exhaust the main worker's CPU/memory budget and impact
   * user-facing request latency.
   */
  readonly heavy?: boolean;
}

export const cronJobs: readonly CronJob[] = [
  {
    name: "publish",
    schedule: "*/5 * * * *",
    path: "/api/cron/publish",
    method: "POST",
    secretEnvVar: "CRON_PUBLISH_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Publish content scheduled for the current window.",
  },
  {
    name: "stripe-sync",
    schedule: "0 1 * * *",
    path: "/api/cron/stripe-sync",
    method: "POST",
    secretEnvVar: "CRON_STRIPE_SYNC_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Reconcile Stripe subscription state with local membership rows.",
  },
  {
    name: "ai-generate",
    schedule: "0 2 * * *",
    path: "/api/cron/ai-generate",
    method: "POST",
    secretEnvVar: "CRON_AI_SECRET",
    csrfExempt: true,
    alertOnFailure: false,
    description: "Daily AI draft generation across active sites.",
    heavy: true,
  },
  {
    name: "sitemap-refresh",
    schedule: "0 3 * * *",
    path: "/api/cron/sitemap-refresh",
    method: "POST",
    secretEnvVar: "CRON_SITEMAP_SECRET",
    csrfExempt: true,
    alertOnFailure: false,
    description: "Refresh per-site sitemaps and ping search engines.",
  },
  {
    name: "data-retention",
    schedule: "0 4 * * *",
    path: "/api/cron/data-retention",
    method: "POST",
    secretEnvVar: "CRON_RETENTION_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "GDPR retention sweep (clicks/audit log/stripe events).",
  },
  {
    name: "commission-ingest",
    schedule: "0 5 * * *",
    path: "/api/cron/commission-ingest",
    method: "POST",
    secretEnvVar: "CRON_COMMISSION_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Pull affiliate-network commission reports and ingest.",
    heavy: true,
  },
  {
    name: "epc-recompute",
    schedule: "0 6 * * *",
    path: "/api/cron/epc-recompute",
    method: "POST",
    secretEnvVar: "CRON_EPC_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Recompute earnings-per-click rollups.",
  },
  {
    name: "price-scrape",
    schedule: "0 7 * * *",
    path: "/api/cron/price-scrape",
    method: "POST",
    secretEnvVar: "CRON_PRICE_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Snapshot prices and fan out price-drop alert emails.",
    heavy: true,
  },
  {
    name: "affiliate-link-health",
    schedule: "0 9 * * *",
    path: "/api/cron/affiliate-link-health",
    method: "POST",
    secretEnvVar: "CRON_AFFILIATE_LINK_HEALTH_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Probe active affiliate destinations and record link health.",
    heavy: true,
  },
  {
    name: "affiliate-optimization",
    schedule: "0 10 * * *",
    path: "/api/cron/affiliate-optimization",
    method: "POST",
    secretEnvVar: "CRON_AFFILIATE_OPTIMIZATION_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Evaluate EPC and affiliate health for guarded product optimizations.",
  },
  {
    name: "expire-deals",
    schedule: "0 * * * *",
    path: "/api/cron/expire-deals",
    method: "POST",
    secretEnvVar: "CRON_DEALS_SECRET",
    csrfExempt: true,
    alertOnFailure: false,
    description: "Mark expired deals/coupons hourly.",
  },
  {
    name: "click-reconcile",
    schedule: "*/15 * * * *",
    path: "/api/cron/click-reconcile",
    method: "POST",
    secretEnvVar: "CRON_CLICK_RECONCILE_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description: "Reconcile click vs click_failures volume and alert on threshold breach.",
  },
  {
    name: "access-review",
    schedule: "0 8 * * 1",
    path: "/api/cron/access-review",
    method: "POST",
    secretEnvVar: "CRON_ACCESS_REVIEW_SECRET",
    csrfExempt: true,
    alertOnFailure: false,
    description: "SOC 2 CC6.1 ΓÇö weekly admin-user access recertification.",
  },
  {
    name: "homepage-synthetic-check",
    schedule: "*/10 * * * *",
    path: "/api/cron/homepage-synthetic-check",
    method: "POST",
    secretEnvVar: "CRON_HOMEPAGE_SYNTHETIC_SECRET",
    csrfExempt: true,
    alertOnFailure: true,
    description:
      "Synthetic check: fail loudly when homepage renders empty while DB has published content.",
  },
] as const;

function buildCronJobMap(
  keyName: "path" | "schedule",
  onDuplicate: (job: CronJob) => string,
): Map<string, CronJob> {
  const map = new Map<string, CronJob>();
  for (const job of cronJobs) {
    const key = job[keyName];
    if (map.has(key)) {
      // eslint-disable-next-line no-console
      console.error(
        `[cron-registry] Duplicate ${keyName} detected in cronJobs: ${onDuplicate(job)}`,
      );
      continue;
    }
    map.set(key, job);
  }
  return map;
}

const cronJobByPath = buildCronJobMap("path", (job) => job.path);
const cronJobBySchedule = buildCronJobMap("schedule", (job) => `${job.schedule} (${job.name})`);

/** Look up a job by its absolute route path. */
export function getCronJobByPath(path: string): CronJob | undefined {
  return cronJobByPath.get(path);
}

/** Look up a job by its cron schedule string. */
export function getCronJobBySchedule(schedule: string): CronJob | undefined {
  return cronJobBySchedule.get(schedule);
}

/**
 * Returns the env-var names a cron route should accept as a valid
 * Bearer secret, in priority order. The per-trigger secret comes
 * first; CRON_FALLBACK_SECRET_ENV is appended last so existing
 * deployments that have only configured the shared secret continue
 * to work.
 *
 * Throws if `path` is not registered ΓÇö wiring up a cron route that
 * isn't in the registry is always a bug.
 */
export function getSecretEnvVarsForCronPath(path: string): readonly string[] {
  const job = cronJobByPath.get(path);
  if (!job) {
    throw new Error(
      `[cron-registry] No cron job registered for path "${path}". ` +
        `Add it to lib/cron-registry.ts before wiring the route.`,
    );
  }
  return [job.secretEnvVar, CRON_FALLBACK_SECRET_ENV];
}

/**
 * Convenience overload that returns the exact options object expected
 * by `verifyCronAuth`, so route handlers can write:
 *
 *   if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/publish"))) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 */
export function getCronAuthOptionsForPath(path: string): { secretEnvVars: readonly string[] } {
  return { secretEnvVars: getSecretEnvVarsForCronPath(path) };
}

/** Schedule -> path map for the Worker's scheduled() handler. */
export function getCronScheduleToPathMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const job of cronJobs) {
    map[job.schedule] = job.path;
  }
  return map;
}

/** All cron schedules, in registry order (matches wrangler.jsonc). */
export function listCronSchedules(): readonly string[] {
  return cronJobs.map((j) => j.schedule);
}

/** A-018: schedules for light jobs (run on the main affilite-mix Worker). */
export function listLightCronSchedules(): readonly string[] {
  return cronJobs.filter((j) => !j.heavy).map((j) => j.schedule);
}

/** Distinct list of every per-trigger + fallback env-var name. */
export function listAllCronSecretEnvVars(): readonly string[] {
  const names = new Set<string>();
  for (const job of cronJobs) {
    names.add(job.secretEnvVar);
  }
  names.add(CRON_FALLBACK_SECRET_ENV);
  return [...names];
}
