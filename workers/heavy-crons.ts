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
 *
 * H2: the handler is wrapped with @sentry/cloudflare's `withSentry` and
 * every failure path emits a `captureException` (gated by the registry's
 * per-job `alertOnFailure` flag for dispatch failures) so misconfiguration
 * and failed heavy runs are visible in Sentry rather than only in the
 * ephemeral Cloudflare dashboard. This matches the main worker's posture.
 */

import { withSentry, captureException } from "@sentry/cloudflare";
import { getCronJobBySchedule, CRON_FALLBACK_SECRET_ENV } from "../lib/cron-registry";
import { logger } from "../lib/logger";

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
      const msg =
        "[heavy-crons] CRON_HOST is not configured — skipping dispatch. " +
        "Set it with: wrangler secret put CRON_HOST --name affilite-mix-heavy-crons";
      logger.error(msg);
      // H2: throw so Sentry/observability captures the misconfiguration
      // instead of silently swallowing missed heavy-cron runs (matches the
      // main worker's CRON_HOST posture).
      throw new Error(msg);
    }

    const job = getCronJobBySchedule(controller.cron);
    if (!job) {
      const err = new Error(
        `[heavy-crons] Unknown cron schedule "${controller.cron}" — no matching route. ` +
          "Add it to lib/cron-registry.ts so the registry, wrangler.heavy-crons.jsonc, " +
          "and the dispatch map all stay in sync.",
      );
      logger.error(err.message);
      captureException(err);
      return;
    }

    if (!job.heavy) {
      // Misconfiguration: a light job's schedule was added to this worker's
      // triggers. It should run on the main worker. Surface it loudly.
      const err = new Error(
        `[heavy-crons] Schedule "${controller.cron}" (${job.name}) is NOT marked heavy. ` +
          "It must be dispatched from the main worker. Check wrangler.heavy-crons.jsonc " +
          "triggers.crons against the `heavy` flags in lib/cron-registry.ts.",
      );
      logger.warn(err.message);
      captureException(err);
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
        `[heavy-crons] Neither ${job.secretEnvVar} nor ${CRON_FALLBACK_SECRET_ENV} is configured ` +
          `for "${job.name}" (${job.path}) — skipping dispatch. ` +
          `Set it with: wrangler secret put ${job.secretEnvVar} --name affilite-mix-heavy-crons`,
      );
      logger.error(err.message);
      captureException(err);
      return;
    }

    const url = `${cronHost}${job.path}`;
    ctx.waitUntil(
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
      })
        .then(async (res: Response) => {
          const body = await res.text();
          if (res.ok) {
            logger.info("[heavy-crons] dispatch responded", {
              job: job.name,
              status: res.status,
              body,
            });
          } else {
            logger.error("[heavy-crons] dispatch failed", {
              job: job.name,
              status: res.status,
              body,
            });
            // H3: honour the registry's per-job alerting hint.
            if (job.alertOnFailure) {
              captureException(
                new Error(`[heavy-crons] "${job.name}" (${job.path}) responded ${res.status}`),
              );
            }
          }
        })
        .catch((err: unknown) => {
          logger.error("[heavy-crons] dispatch fetch error", { job: job.name, error: err });
          if (job.alertOnFailure) {
            captureException(err instanceof Error ? err : new Error(String(err)));
          }
        }),
    );
  },
};

function parseSampleRate(raw: unknown, fallback: number): number {
  if (typeof raw !== "string" || !raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

// H2: wrap with @sentry/cloudflare so captureException calls above actually
// emit events. Mirrors workers/custom-worker.ts — the options callback
// receives the Cloudflare `env` binding (SENTRY_DSN is plumbed via secrets).
export default withSentry((env: Record<string, unknown>) => {
  const dsn = typeof env.SENTRY_DSN === "string" ? env.SENTRY_DSN.trim() : "";
  const environment =
    typeof env.NODE_ENV === "string" && env.NODE_ENV ? env.NODE_ENV : "production";
  const release =
    typeof env.SENTRY_RELEASE === "string" && env.SENTRY_RELEASE ? env.SENTRY_RELEASE : undefined;
  return {
    dsn,
    environment,
    release,
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    sendDefaultPii: false,
  };
}, worker);
