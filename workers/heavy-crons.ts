/**
 * A-018: Dedicated Cloudflare Worker for heavy cron jobs.
 *
 * Heavy crons (ai-generate, commission-ingest, price-scrape) perform
 * long-running work with many external API calls. Running them on the
 * same worker that serves user requests risks CPU timeout / memory
 * exhaustion and adds latency to user traffic. This lightweight
 * dispatcher worker isolates them by receiving cron events and
 * forwarding them to the main affilite-mix app via HTTP.
 *
 * This worker intentionally does NOT bundle Next.js / OpenNext — it
 * is a thin TypeScript file compiled by wrangler. The actual business
 * logic stays in the main app (`app/api/cron/*`) so there is no code
 * duplication.
 */

import { getCronJobBySchedule, CRON_FALLBACK_SECRET_ENV } from "../lib/cron-registry";
import { logger } from "../lib/logger";
import { captureException } from "@sentry/cloudflare";

interface CloudflareScheduledController {
  cron: string;
  scheduledTime: number;
}
interface CloudflareExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(JSON.stringify({ ok: true, worker: "heavy-crons" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },

  async scheduled(
    controller: CloudflareScheduledController,
    env: Record<string, unknown>,
    ctx: CloudflareExecutionContext,
  ) {
    const cronHost =
      typeof env.CRON_HOST === "string" && env.CRON_HOST.trim() ? env.CRON_HOST.trim() : null;

    if (!cronHost) {
      const err = new Error(
        "[heavy-crons] CRON_HOST is not configured — skipping dispatch. " +
          "Set it with: wrangler secret put CRON_HOST",
      );
      logger.error(err.message);
      captureException(err);
      throw err;
    }

    const job = getCronJobBySchedule(controller.cron);
    if (!job) {
      const err = new Error(
        `[heavy-crons] Unknown cron schedule "${controller.cron}". ` +
          "Add it to lib/cron-registry.ts.",
      );
      logger.error(err.message);
      captureException(err);
      throw err;
    }

    if (!job.heavy) {
      logger.warn(
        `[heavy-crons] Schedule "${controller.cron}" (${job.name}) is NOT marked heavy. ` +
          "It should be dispatched from the main worker instead.",
      );
      return;
    }

    const perTriggerSecret = env[job.secretEnvVar];
    const fallbackSecret = env[CRON_FALLBACK_SECRET_ENV];
    const cronSecret =
      typeof perTriggerSecret === "string" && perTriggerSecret
        ? perTriggerSecret
        : typeof fallbackSecret === "string" && fallbackSecret
          ? fallbackSecret
          : null;

    if (!cronSecret) {
      const err = new Error(
        `[heavy-crons] No secret configured for "${job.name}" — skipping dispatch. ` +
          `Set it with: wrangler secret put ${job.secretEnvVar}`,
      );
      logger.error(err.message);
      captureException(err);
      throw err;
    }

    const url = `${cronHost}${job.path}`;
    // A-018 / P1-5: await the dispatch and throw on terminal failure so the
    // scheduled invocation is marked failed and surfaced to alerting. Cron
    // triggers do NOT auto-retry the way Queues do, so transient failures are
    // retried HERE with bounded exponential backoff before we give up. A
    // terminal failure both alerts (captureException) and rejects the promise.
    await dispatchWithRetry(url, cronSecret, job.name);
  },
};

/** Per-attempt request timeout (ms). Heavy routes can be slow but must not hang. */
const DISPATCH_TIMEOUT_MS = 25_000;
/** Maximum dispatch attempts (1 initial + retries). */
const DISPATCH_MAX_ATTEMPTS = 3;
/** Base backoff (ms); doubled each retry: 1s, 2s, ... */
const DISPATCH_BASE_BACKOFF_MS = 1_000;

/** A 4xx (other than 408/429) is a client/config error — retrying won't help. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function dispatchOnce(
  url: string,
  cronSecret: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
        "Accept-Version": "1",
      },
      signal: controller.signal,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchWithRetry(url: string, cronSecret: string, jobName: string): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= DISPATCH_MAX_ATTEMPTS; attempt++) {
    try {
      const { ok, status, body } = await dispatchOnce(url, cronSecret);
      if (ok) {
        logger.info("[heavy-crons] dispatch responded", { job: jobName, status, body, attempt });
        return;
      }

      lastError = new Error(`Heavy cron dispatch failed for ${jobName}: ${status}`);
      logger.error("[heavy-crons] dispatch failed", { job: jobName, status, body, attempt });

      // Non-retryable client/config error (e.g. 401/403 bad secret) — fail fast.
      if (!isRetryableStatus(status)) break;
    } catch (err) {
      // Network error / timeout / abort — retryable.
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.error("[heavy-crons] dispatch error", {
        job: jobName,
        error: lastError.message,
        attempt,
      });
    }

    // Back off before the next attempt (skip the wait after the final attempt).
    if (attempt < DISPATCH_MAX_ATTEMPTS) {
      const backoffMs = DISPATCH_BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // Terminal failure: alert and reject so the scheduled invocation is marked failed.
  const terminal =
    lastError ??
    new Error(`Heavy cron dispatch failed for ${jobName} after ${DISPATCH_MAX_ATTEMPTS} attempts`);
  captureException(terminal, {
    tags: { job: jobName, worker: "heavy-crons" },
    extra: { attempts: DISPATCH_MAX_ATTEMPTS },
  });
  throw terminal;
}

export default worker;
