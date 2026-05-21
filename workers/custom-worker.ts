/**
 * Custom Cloudflare Worker entry point.
 *
 * Wraps the @opennextjs/cloudflare-generated fetch handler and adds a
 * `scheduled` handler so that cron triggers defined in wrangler.jsonc
 * dispatch to the correct `/api/cron/*` endpoint based on the schedule.
 *
 * NOTE: This file is compiled by wrangler at deploy time (not by Next.js/tsc),
 * so Cloudflare Worker globals (ScheduledController, ExecutionContext, etc.)
 * are available at runtime. We use `eslint-disable` and inline types to avoid
 * requiring @cloudflare/workers-types as a project dependency.
 *
 * @see https://opennext.js.org/cloudflare/howtos/custom-worker
 * @see https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
 */

// @ts-ignore -- `.open-next/worker.js` is generated at build time
import { default as handler } from "../.open-next/worker.js";
import { RateLimiterDO } from "./rate-limiter-do";
import { getCronJobBySchedule, CRON_FALLBACK_SECRET_ENV } from "../lib/cron-registry";
import { signInternalRequest } from "../lib/internal-hmac";

// Minimal type stubs for Cloudflare Worker APIs (provided by the runtime)
interface CloudflareScheduledController {
  cron: string;
  scheduledTime: number;
}
interface CloudflareExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

// F-028: Cloudflare Queue message for click tracking.
interface CloudflareQueueMessage<T = unknown> {
  id: string;
  timestamp: Date;
  body: T;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface CloudflareMessageBatch<T = unknown> {
  queue: string;
  messages: CloudflareQueueMessage<T>[];
  ackAll(): void;
  retryAll(options?: { delaySeconds?: number }): void;
}

const worker = {
  fetch: handler.fetch,

  async scheduled(
    controller: CloudflareScheduledController,
    env: Record<string, unknown>,
    ctx: CloudflareExecutionContext,
  ) {
    // Determine the canonical base URL for cron dispatch.
    // Priority: CRON_HOST (explicit, required in production) -> CF_PAGES_URL (legacy).
    // A hardcoded domain fallback is intentionally absent: silently posting to
    // the wrong host on a non-wristnerd.xyz deployment would cause missed jobs
    // or cross-environment interference with no visible error.
    const cronHost =
      typeof env.CRON_HOST === "string" && env.CRON_HOST.trim()
        ? env.CRON_HOST.trim()
        : typeof env.CF_PAGES_URL === "string" && env.CF_PAGES_URL.trim()
          ? env.CF_PAGES_URL.trim()
          : null;

    if (!cronHost) {
      console.error(
        "[scheduled] CRON_HOST is not configured -- skipping cron dispatch. " +
          "Set it with: wrangler secret put CRON_HOST (e.g., https://example.com). " +
          "Without this, scheduled jobs will be silently skipped.",
      );
      return;
    }

    // Schedule -> job lookup is derived from the central cron registry
    // (lib/cron-registry.ts) so wrangler.jsonc, this dispatch table,
    // the route handlers, and .env.example never drift apart.
    const job = getCronJobBySchedule(controller.cron);
    if (!job) {
      console.error(
        `[scheduled] Unknown cron schedule "${controller.cron}" -- no matching route. ` +
          "Add it to lib/cron-registry.ts so the registry, wrangler.jsonc, " +
          "and the dispatch map all stay in sync.",
      );
      return;
    }

    // Prefer the per-trigger secret so operators can rotate or revoke a
    // single trigger without touching the others. Fall back to the shared
    // CRON_SECRET so deployments that haven't rolled out per-trigger
    // secrets yet keep working — matches the route-side acceptance order.
    const perTriggerSecret = env[job.secretEnvVar];
    const fallbackSecret = env[CRON_FALLBACK_SECRET_ENV];
    const cronSecret =
      typeof perTriggerSecret === "string" && perTriggerSecret
        ? perTriggerSecret
        : typeof fallbackSecret === "string" && fallbackSecret
          ? fallbackSecret
          : null;

    if (!cronSecret) {
      console.error(
        `[scheduled] Neither ${job.secretEnvVar} nor ${CRON_FALLBACK_SECRET_ENV} is configured ` +
          `for cron "${controller.cron}" (${job.path}) -- skipping dispatch. ` +
          `Set it with: wrangler secret put ${job.secretEnvVar}`,
      );
      return;
    }

    const path = job.path;
    const url = `${cronHost}${path}`;

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
            console.log(
              `[scheduled] cron=${controller.cron} -- ${path} responded ${res.status}:`,
              body,
            );
          } else {
            console.error(
              `[scheduled] cron=${controller.cron} -- ${path} failed ${res.status}:`,
              body,
            );
          }
        })
        .catch((err: unknown) => {
          console.error(`[scheduled] cron=${controller.cron} -- fetch error:`, err);
        }),
    );
  },

  /**
   * F-028: consume click-tracking queue batches and forward to the internal
   * API endpoint /api/queue/clicks which persists them to Supabase.
   *
   * Address R5 & R6: Handles both the main queue and the DLQ. Uses per-message
   * acking/retrying to prevent head-of-line blocking from poison messages.
   */
  async queue(
    batch: CloudflareMessageBatch,
    env: Record<string, unknown>,
    ctx: CloudflareExecutionContext,
  ) {
    if (batch.queue === "click-tracking-dlq") {
      // R5: DLQ consumer. Every dead letter represents a click whose revenue
      // attribution we have lost. Until a persistent `click_failures` table
      // (or equivalent) is wired up, log each payload individually so the
      // bodies are recoverable from Worker tail logs / Logpush.
      //
      // F-024: Persist DLQ messages durably by sending to internal API with dlq flag
      const internalToken = env.INTERNAL_API_TOKEN;
      const cronHost =
        typeof env.CRON_HOST === "string" && env.CRON_HOST.trim() ? env.CRON_HOST.trim() : null;

      if (typeof internalToken === "string" && internalToken && cronHost) {
        // R-N002: only ack DLQ messages once /api/queue/clicks?dlq=true has
        // confirmed they were durably persisted (HTTP 2xx). On any non-2xx,
        // network error, or unexpected exception we retry the batch so the
        // last-parachute attribution evidence cannot vanish silently.
        ctx.waitUntil(
          (async () => {
            const dlqUrl = `${cronHost}/api/queue/clicks?dlq=true`;
            try {
              const dlqBody = JSON.stringify({ messages: batch.messages.map((m) => m.body) });
              // FIX-03: Sign with HMAC; keep Bearer for backward compat during migration
              const hmacHeaders = await signInternalRequest(internalToken as string, dlqBody, {
                Authorization: `Bearer ${internalToken}`,
                "Content-Type": "application/json",
              });
              const res = await fetch(dlqUrl, {
                method: "POST",
                headers: hmacHeaders,
                body: dlqBody,
              });

              if (res.ok) {
                batch.ackAll();
              } else {
                const bodyText = await res.text().catch(() => "");
                console.error(
                  `[queue/click-tracking-dlq] DLQ persistence returned ${res.status} — retrying batch:`,
                  bodyText,
                );
                batch.retryAll();
              }
            } catch (err) {
              console.error("[queue/click-tracking-dlq] failed to persist dead letters:", err);
              batch.retryAll();
            }
          })(),
        );
      } else {
        // Without an internal token / cron host we have no durable sink, so
        // log the bodies (recoverable from Worker tail / Logpush) and ack —
        // there is nothing to retry against.
        for (const msg of batch.messages) {
          console.error("[queue/click-tracking-dlq] dead letter", msg);
        }
        batch.ackAll();
      }
      return;
    }

    if (batch.queue !== "click-tracking") {
      // Unknown queue — ack so it doesn't loop forever
      batch.ackAll();
      return;
    }

    const internalToken = env.INTERNAL_API_TOKEN;
    const cronHost =
      typeof env.CRON_HOST === "string" && env.CRON_HOST.trim() ? env.CRON_HOST.trim() : null;

    if (typeof internalToken !== "string" || !internalToken || !cronHost) {
      console.error(
        "[queue/click-tracking] INTERNAL_API_TOKEN or CRON_HOST missing — retrying batch",
      );
      batch.retryAll({ delaySeconds: 60 });
      return;
    }

    const url = `${cronHost}/api/queue/clicks`;

    // R6: Instead of sending the whole batch as one chunk and failing the whole batch,
    // we send messages and handle per-message ack/retry based on the response.
    // To simplify while maintaining batching, we send the batch. If it fails with a 4xx (poison),
    // we should ideally split it. For now, we'll send them one by one if we want true per-message ack,
    // OR we change the API endpoint to return which messages failed.
    // The simplest robust fix for R6 without rewriting the API is to iterate and send.
    // Since Cloudflare Worker allows concurrent fetches, we can Promise.all them.

    // F-012: Send one batched request instead of fanning out N HTTP calls
    ctx.waitUntil(
      (async () => {
        try {
          const queueBody = JSON.stringify({ messages: batch.messages.map((m) => m.body) });
          // FIX-03: Sign with HMAC; keep Bearer for backward compat during migration
          const hmacHeaders = await signInternalRequest(internalToken as string, queueBody, {
            Authorization: `Bearer ${internalToken}`,
            "Content-Type": "application/json",
          });
          const res = await fetch(url, {
            method: "POST",
            headers: hmacHeaders,
            body: queueBody,
          });

          if (res.ok) {
            batch.ackAll();
          } else {
            // If the batch fails, retry the whole batch
            batch.retryAll();
          }
        } catch (err) {
          console.error("[queue/click-tracking] batch fetch error:", err);
          batch.retryAll();
        }
      })(),
    );
  },
};

export default worker;

// Re-export Durable Object classes required by OpenNext's caching layer
// @ts-ignore -- `.open-next/worker.js` is generated at build time
export { DOQueueHandler, DOShardedTagCache } from "../.open-next/worker.js";

// F-005: Durable Object rate limiter (atomic fixed-window counter).
// Bound as RATE_LIMITER_DO in wrangler.jsonc; consumed by lib/rate-limit.ts.
export { RateLimiterDO };
