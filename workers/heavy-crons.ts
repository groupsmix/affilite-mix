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

import { withSentry, captureException } from "@sentry/cloudflare";
import { getCronJobBySchedule, CRON_FALLBACK_SECRET_ENV } from "../lib/cron-registry";
import { buildInternalHmacContext, signInternalRequest } from "../lib/internal-hmac";
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
        "Set it with: wrangler secret put CRON_HOST";
      logger.error(msg);
      captureException(new Error(msg));
      return;
    }

    const job = getCronJobBySchedule(controller.cron);
    if (!job) {
      const err = new Error(
        `[heavy-crons] Unknown cron schedule "${controller.cron}". ` +
          "Add it to lib/cron-registry.ts.",
      );
      logger.error(err.message);
      captureException(err);
      return;
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
      logger.error(`[heavy-crons] No secret configured for "${job.name}" — skipping dispatch.`);
      captureException(
        new Error(
          `[heavy-crons] No secret configured for "${job.name}" (${job.path}) — skipping dispatch.`,
        ),
      );
      return;
    }

    const url = `${cronHost}${job.path}`;
    ctx.waitUntil(
      (async () => {
        let headers: Record<string, string>;
        try {
          const body = "";
          headers = await signInternalRequest(
            cronSecret,
            body,
            {
              Authorization: `Bearer ${cronSecret}`,
              "Content-Type": "application/json",
            },
            buildInternalHmacContext("POST", url),
          );
        } catch (err: unknown) {
          logger.error("[heavy-crons] failed to sign request", { job: job.name, error: err });
          captureException(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        return fetch(url, { method: "POST", headers })
          .then(async (res: Response) => {
            const resBody = await res.text();
            if (res.ok) {
              logger.info("[heavy-crons] dispatch responded", {
                job: job.name,
                status: res.status,
                body: resBody,
              });
            } else {
              logger.error("[heavy-crons] dispatch failed", {
                job: job.name,
                status: res.status,
                body: resBody,
              });
            }
          })
          .catch((err: unknown) => {
            logger.error("[heavy-crons] dispatch fetch error", { job: job.name, error: err });
            captureException(err instanceof Error ? err : new Error(String(err)));
          });
      })(),
    );
  },
};

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

function parseSampleRate(raw: unknown, fallback: number): number {
  if (typeof raw !== "string" || !raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}
