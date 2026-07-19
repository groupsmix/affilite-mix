/**
 * FIX-16 (F-023): Cron liveness alarm system.
 *
 * Detects when cron jobs silently stop running (e.g. Cloudflare cron
 * trigger misconfiguration, Worker deployment that dropped a trigger,
 * or a persistent 500 that causes the Worker to skip dispatch).
 *
 * Approach:
 *   1. Each cron route records its last-successful-run timestamp in
 *      APP_CACHE_KV under `cron-liveness:<job-name>`.
 *   2. A dedicated liveness check (called from the publish cron, which
 *      runs every 5 minutes — the most frequent job) reads all
 *      timestamps and emits a structured log for any job that hasn't
 *      reported within its expected window.
 *   3. The structured `cron_liveness_miss` log is picked up by
 *      Logpush / Worker tail and can trigger a Sentry alert via
 *      the existing burn-rate alerting.
 *
 * Expected intervals are derived from the cron schedule in the registry.
 * A job is considered "missed" if it hasn't reported within
 * (expected interval × 2 + 10 minutes), giving a generous buffer for
 * natural scheduling jitter. In practice this means the alarm fires
 * after two consecutive runs are skipped (G-52). Per-job cadence and
 * threshold are documented in `docs/cron-liveness.md`.
 */

import { cronJobs } from "@/lib/cron-registry";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { getAppCacheKV, readGlobalBinding } from "@/lib/runtime-env";

/** Best-effort deployment timestamp for first-run alerting. */
let deploymentTimestamp = Date.now();

/** KV key prefix for liveness timestamps. */
const KV_PREFIX = "cron-liveness:";

/** Minimum number of seconds between liveness checks to avoid KV spam. */
const LIVENESS_CHECK_INTERVAL_SECS = 4 * 60; // 4 minutes (publish runs every 5)

/** Per-isolate timestamp of the last liveness check. */
let lastLivenessCheckAt = 0;

/**
 * Parse a 5-field cron expression into an approximate interval in seconds.
 * Handles only the patterns used in this project's cron registry.
 */
function parseCronIntervalSeconds(schedule: string): number {
  const parts = schedule.split(" ");
  if (parts.length !== 5) return 3600; // default 1h if unparseable

  const [minute, hour, , ,] = parts;

  // Every N minutes: */N * * * *
  if (minute!.startsWith("*/")) {
    const n = Number.parseInt(minute!.slice(2), 10);
    if (Number.isFinite(n) && n > 0) return n * 60;
  }

  // Every hour at minute M: M * * * *
  if (hour === "*") return 3600;

  // Once daily at H:M: M H * * *
  const h = Number.parseInt(hour!, 10);
  if (Number.isFinite(h)) return 86400;

  // Fallback
  return 3600;
}

/**
 * Record a successful cron run in KV.
 * Call this at the end of every cron route handler on success.
 */
export async function recordCronLiveness(jobName: string): Promise<void> {
  try {
    const kv = readKVBinding();
    if (!kv) return;
    await kv.put(`${KV_PREFIX}${jobName}`, String(Date.now()), {
      expirationTtl: 86400 * 7, // 7 days — enough for weekly jobs
    });
  } catch (err) {
    // Liveness tracking must not break the cron job itself, but a persistent
    // KV failure should still be alerted so missed-cron detection is not blind.
    captureException(err, {
      context: "[cron-liveness] Failed to record cron liveness",
      extra: { job: jobName },
    });
  }
}

/**
 * Check all registered cron jobs for liveness and emit alerts for
 * any that have missed their expected window.
 *
 * Call this from the most frequent cron (publish, every 5 min) so
 * checks happen regularly without adding a new cron trigger.
 */
export async function checkCronLiveness(): Promise<void> {
  const now = Date.now();

  // Throttle: don't check more often than necessary
  if (now - lastLivenessCheckAt < LIVENESS_CHECK_INTERVAL_SECS * 1000) return;
  lastLivenessCheckAt = now;

  const kv = readKVBinding();
  if (!kv) {
    const err = new Error(
      "[cron-liveness] APP_CACHE_KV binding unavailable; cannot check cron liveness",
    );
    logger.error(err.message);
    captureException(err, { context: "[cron-liveness] KV binding unavailable" });
    return;
  }

  for (const job of cronJobs) {
    if (!job.alertOnFailure) continue; // skip low-stakes jobs

    const expectedIntervalSec = parseCronIntervalSeconds(job.schedule);
    const maxSkewSec = expectedIntervalSec * 2 + 600; // 2x + 10min buffer

    try {
      const raw = await kv.get(`${KV_PREFIX}${job.name}`);
      if (!raw) {
        // No liveness record yet — could be first deploy. After the expected
        // window has elapsed since deployment, treat a missing first success as
        // a missed window so "never ran after deploy" does not stay silent.
        const firstRunDeadline = deploymentTimestamp + maxSkewSec * 1000;
        if (now > firstRunDeadline) {
          const msg = `Cron job "${job.name}" has never reported since deployment (expected every ${Math.round(expectedIntervalSec / 60)}min)`;
          const livenessError = new Error(msg);
          logger.error(`[cron-liveness] ${msg}`, {
            job: job.name,
            schedule: job.schedule,
            expectedIntervalSec,
            deploymentTimestamp,
          });
          logger.error("cron_liveness_first_run_missed", {
            job: job.name,
            schedule: job.schedule,
            expected_interval_sec: expectedIntervalSec,
            deployment_timestamp: deploymentTimestamp,
          });
          captureException(livenessError, {
            context: "[cron-liveness] Cron job never reported since deployment",
            extra: {
              job: job.name,
              schedule: job.schedule,
              expected_interval_sec: expectedIntervalSec,
              deployment_timestamp: deploymentTimestamp,
            },
          });
        } else {
          logger.info("[cron-liveness] No liveness record yet", { job: job.name });
        }
        continue;
      }

      const lastRun = Number(raw);
      if (!Number.isFinite(lastRun)) continue;

      const elapsed = (now - lastRun) / 1000;

      if (elapsed > maxSkewSec) {
        const msg = `Cron job "${job.name}" has not reported for ${Math.round(elapsed / 60)}min (expected every ${Math.round(expectedIntervalSec / 60)}min)`;
        const livenessError = new Error(msg);
        logger.error(`[cron-liveness] ${msg}`, {
          job: job.name,
          schedule: job.schedule,
          lastRunAgoMs: now - lastRun,
          expectedIntervalSec,
        });
        logger.error("cron_liveness_miss", {
          job: job.name,
          schedule: job.schedule,
          last_run_ago_sec: Math.round(elapsed),
          expected_interval_sec: expectedIntervalSec,
        });
        // SRE-1: surface missed cron runs to the configured alert destination
        // (Sentry / Logpush) instead of relying only on log-based detection.
        captureException(livenessError, {
          context: "[cron-liveness] Cron job missed expected window",
          extra: {
            job: job.name,
            schedule: job.schedule,
            last_run_ago_sec: Math.round(elapsed),
            expected_interval_sec: expectedIntervalSec,
          },
        });
      }
    } catch (err) {
      // fail-open: best-effort [criticality:non-critical]
      // Non-critical — but surface the failure so the liveness monitor itself
      // does not become an invisible blind spot.
      captureException(err instanceof Error ? err : new Error(String(err)), {
        context: "[cron-liveness] KV read failed",
        extra: { job: job.name },
      });
    }
  }
}

/** Read the APP_CACHE_KV binding. */
function readKV(): KVNamespace | undefined {
  const fromGlobal = readGlobalBinding<KVNamespace>("APP_CACHE_KV", "get");
  if (fromGlobal) return fromGlobal;
  try {
    const kv = getAppCacheKV();
    if (kv) {
      return kv as KVNamespace;
    }
  } catch (err) {
    // fail-open: best-effort [criticality:non-critical]
    // process.env not available — surface so the liveness monitor is not silent.
    captureException(err instanceof Error ? err : new Error(String(err)), {
      context: "[cron-liveness] Failed to read APP_CACHE_KV binding",
    });
  }
  return undefined;
}

// Inline to avoid circular import
function readKVBinding(): KVNamespace | undefined {
  return readKV();
}
