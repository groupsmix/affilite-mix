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

// @ts-expect-error -- `.open-next/worker.js` is generated at build time
import { default as handler } from "../.open-next/worker.js";
import { withSentry, captureException } from "@sentry/cloudflare";
import { RateLimiterDO } from "./rate-limiter-do";
import { getCronJobBySchedule, CRON_FALLBACK_SECRET_ENV } from "../lib/cron-registry";
import { buildInternalHmacContext, signInternalRequest } from "../lib/internal-hmac";
import { logger } from "../lib/logger";

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

/**
 * C1 fix: resolve the internal token used to authenticate to
 * /api/queue/clicks. The route verifies against
 * `getInternalTokenFor("click_queue")`, which maps to
 * INTERNAL_API_TOKEN_CLICK_QUEUE (with a legacy INTERNAL_API_TOKEN fallback
 * outside production). The worker MUST sign with the same token or every
 * batch fails the HMAC check (403 in strict mode), retries forever, and the
 * DLQ branch loses the click/attribution evidence when retention expires.
 * Prefer the per-purpose token; fall back to the monolithic token so a
 * transition deploy (where only INTERNAL_API_TOKEN is set) still works.
 */
function resolveClickQueueToken(env: Record<string, unknown>): string | null {
  const purpose =
    typeof env.INTERNAL_API_TOKEN_CLICK_QUEUE === "string" &&
    env.INTERNAL_API_TOKEN_CLICK_QUEUE.trim()
      ? env.INTERNAL_API_TOKEN_CLICK_QUEUE.trim()
      : null;
  if (purpose) return purpose;
  return typeof env.INTERNAL_API_TOKEN === "string" && env.INTERNAL_API_TOKEN.trim()
    ? env.INTERNAL_API_TOKEN.trim()
    : null;
}

const worker = {
  // L1: bind to the generated handler so any internal `this` reference inside
  // the OpenNext fetch handler resolves correctly (a detached method would
  // lose its receiver).
  fetch: handler.fetch.bind(handler),

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
      const msg =
        "[scheduled] CRON_HOST is not configured -- skipping cron dispatch. " +
        "Set it with: wrangler secret put CRON_HOST (e.g., https://example.com). " +
        "Without this, scheduled jobs will be silently skipped.";
      logger.error(msg);
      // SEC-06: Throw so Sentry/observability captures the misconfiguration
      // instead of silently swallowing missed cron runs.
      throw new Error(msg);
    }

    // Schedule -> job lookup is derived from the central cron registry
    // (lib/cron-registry.ts) so wrangler.jsonc, this dispatch table,
    // the route handlers, and .env.example never drift apart.
    const job = getCronJobBySchedule(controller.cron);
    if (!job) {
      const err = new Error(
        `[scheduled] Unknown cron schedule "${controller.cron}" -- no matching route. ` +
          "Add it to lib/cron-registry.ts so the registry, wrangler.jsonc, " +
          "and the dispatch map all stay in sync.",
      );
      logger.error(err.message);
      captureException(err);
      return;
    }

    // M4: the main worker serves user requests. Heavy jobs (ai-generate,
    // commission-ingest, price-scrape) are deliberately isolated on the
    // affilite-mix-heavy-crons worker so they cannot exhaust request-path
    // CPU/memory. If a heavy schedule ever fires here it means wrangler.jsonc
    // has drifted from lib/cron-registry.ts (e.g. a schedule collision).
    // Refuse to dispatch and surface the misconfiguration loudly.
    if (job.heavy) {
      const err = new Error(
        `[scheduled] Heavy cron "${controller.cron}" (${job.name}) fired on the main worker. ` +
          "Heavy jobs must run on affilite-mix-heavy-crons. Check wrangler.jsonc " +
          "triggers.crons for a schedule collision with lib/cron-registry.ts.",
      );
      logger.error(err.message);
      captureException(err);
      return;
    }
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
      const err = new Error(
        `[scheduled] Neither ${job.secretEnvVar} nor ${CRON_FALLBACK_SECRET_ENV} is configured ` +
          `for cron "${controller.cron}" (${job.path}) -- skipping dispatch. ` +
          `Set it with: wrangler secret put ${job.secretEnvVar}`,
      );
      logger.error(err.message);
      captureException(err);
      return;
    }

    const path = job.path;
    const url = `${cronHost}${path}`;

    // R-005/ADR-0008: pin the v1 API contract for all internal cron dispatches.
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
        "Accept-Version": "1",
      },
    });
    const body = await res.text();
    if (!res.ok) {
      const dispatchErr = new Error(`Cron dispatch failed for ${controller.cron}: ${res.status}`);
      logger.error("[scheduled] cron dispatch failed", {
        cron: controller.cron,
        path,
        status: res.status,
        body,
      });
      captureException(dispatchErr);
      throw dispatchErr;
    }
    logger.info("[scheduled] cron dispatch responded", {
      cron: controller.cron,
      path,
      status: res.status,
      body,
    });
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
    // T4-#3: recognise both production and staging queue names. The DLQ
    // consumers (click-tracking-dlq / -staging) are wired in wrangler.jsonc;
    // without this generalisation a staging batch would fall through to the
    // "unknown queue" ackAll() below and be silently dropped.
    const DLQ_QUEUES = new Set(["click-tracking-dlq", "click-tracking-dlq-staging"]);
    const MAIN_QUEUES = new Set(["click-tracking", "click-tracking-staging"]);

    if (DLQ_QUEUES.has(batch.queue)) {
      // R5: DLQ consumer. Every dead letter represents a click whose revenue
      // attribution we have lost. Until a persistent `click_failures` table
      // (or equivalent) is wired up, log each payload individually so the
      // bodies are recoverable from Worker tail logs / Logpush.
      //
      // F-024: Persist DLQ messages durably by sending to internal API with dlq flag
      const internalToken = resolveClickQueueToken(env);
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
              const hmacHeaders = await signInternalRequest(
                internalToken as string,
                dlqBody,
                {
                  Authorization: `Bearer ${internalToken}`,
                  "Content-Type": "application/json",
                },
                // audit #7: bind the exact operation we are about to POST,
                // including ?dlq=true, so the signature can't be re-pointed.
                buildInternalHmacContext("POST", dlqUrl),
              );
              const res = await fetch(dlqUrl, {
                method: "POST",
                headers: hmacHeaders,
                body: dlqBody,
              });

              if (res.ok) {
                batch.ackAll();
              } else {
                const bodyText = await res.text().catch(() => "");
                logger.error("[queue/click-tracking-dlq] DLQ persistence failed — retrying batch", {
                  status: res.status,
                  body: bodyText,
                });
                batch.retryAll();
              }
            } catch (err) {
              logger.error("[queue/click-tracking-dlq] failed to persist dead letters", {
                error: err,
              });
              batch.retryAll();
            }
          })(),
        );
      } else {
        // R-16: Without an internal token / cron host we have no durable sink.
        // Do NOT ack — retry so messages remain in the queue until config is fixed.
        // Log the situation loudly so operators notice the misconfiguration.
        logger.error(
          "[queue/click-tracking-dlq] click-queue internal token or CRON_HOST missing — " +
            "refusing to ACK DLQ messages without durable persistence. " +
            "Retrying batch. Set INTERNAL_API_TOKEN_CLICK_QUEUE (or INTERNAL_API_TOKEN) " +
            "and CRON_HOST to prevent data loss.",
        );
        batch.retryAll({ delaySeconds: 300 });
      }
      return;
    }

    if (!MAIN_QUEUES.has(batch.queue)) {
      // L4: surface misrouted/misconfigured queues instead of silently
      // dropping them. We still ack so an unknown queue can't loop forever,
      // but the error makes the misconfiguration visible in logs/alerting.
      logger.error("[queue] received batch from unrecognised queue — acking to avoid a loop", {
        queue: batch.queue,
        messageCount: batch.messages.length,
      });
      batch.ackAll();
      return;
    }

    const internalToken = resolveClickQueueToken(env);
    const cronHost =
      typeof env.CRON_HOST === "string" && env.CRON_HOST.trim() ? env.CRON_HOST.trim() : null;

    if (typeof internalToken !== "string" || !internalToken || !cronHost) {
      logger.error(
        "[queue/click-tracking] click-queue internal token or CRON_HOST missing — retrying batch",
      );
      batch.retryAll({ delaySeconds: 60 });
      return;
    }

    const url = `${cronHost}/api/queue/clicks`;

    // F-012 / audit5-#13: Send one batched HTTP request, but expect the
    // API to return per-message success/failure granularity. The API
    // body is `{ messages: [{ msgId, body }, ...] }` and the response
    // is `{ acked: [msgId, ...], failed: [{ msgId, reason }, ...] }`.
    // Each Cloudflare queue message is ack'd or retried based on the
    // API response — a partial-success outcome no longer requeues
    // already-persisted messages.
    //
    // Backwards compatibility: if the API ever returns 2xx without
    // the `acked`/`failed` envelope (legacy build, accidental rollback),
    // we fall back to the prior "ack the whole batch" semantics so a
    // mismatched deploy does not lose messages.
    ctx.waitUntil(
      (async () => {
        try {
          const envelope = {
            messages: batch.messages.map((m) => ({
              msgId: m.id,
              body: m.body,
            })),
          };
          const queueBody = JSON.stringify(envelope);
          // FIX-03: Sign with HMAC; keep Bearer for backward compat during migration
          const hmacHeaders = await signInternalRequest(
            internalToken as string,
            queueBody,
            {
              Authorization: `Bearer ${internalToken}`,
              "Content-Type": "application/json",
            },
            // audit #7: bind method + path (no ?dlq) so this normal-queue
            // signature can't be replayed against the dlq branch.
            buildInternalHmacContext("POST", url),
          );
          const res = await fetch(url, {
            method: "POST",
            headers: hmacHeaders,
            body: queueBody,
          });

          if (!res.ok) {
            // Auth failure, 5xx, network-level error — retry the whole
            // batch with backoff. Same behaviour as before audit5-#13.
            batch.retryAll();
            return;
          }

          // Parse the per-message envelope. If the response is malformed
          // or missing the envelope, fall back to ackAll(): the API said
          // 2xx so the messages did land somewhere (DB upsert or
          // click_failures table), and re-queueing them would generate
          // duplicates that the idempotent upsert has to swallow.
          let parsed: unknown;
          try {
            parsed = await res.json();
          } catch {
            batch.ackAll();
            return;
          }

          const acked = new Set<string>();
          const failed = new Set<string>();
          if (parsed && typeof parsed === "object") {
            const p = parsed as {
              acked?: unknown;
              failed?: unknown;
            };
            if (Array.isArray(p.acked)) {
              for (const id of p.acked) {
                if (typeof id === "string") acked.add(id);
              }
            }
            if (Array.isArray(p.failed)) {
              for (const entry of p.failed) {
                if (typeof entry === "string") {
                  failed.add(entry);
                } else if (
                  entry &&
                  typeof entry === "object" &&
                  typeof (entry as { msgId?: unknown }).msgId === "string"
                ) {
                  failed.add((entry as { msgId: string }).msgId);
                }
              }
            }
          }

          // No envelope in response — legacy API behaviour. Ack the
          // whole batch (the 2xx response means the API accepted them).
          if (acked.size === 0 && failed.size === 0) {
            batch.ackAll();
            return;
          }

          // Per-message ack/retry. Messages not listed in either set
          // are treated as failed (conservatively retried).
          for (const msg of batch.messages) {
            if (acked.has(msg.id)) {
              msg.ack();
            } else if (failed.has(msg.id)) {
              msg.retry();
            } else {
              // API skipped this id — retry to be safe.
              msg.retry();
            }
          }
        } catch (err) {
          logger.error("[queue/click-tracking] batch fetch error", { error: err });
          batch.retryAll();
        }
      })(),
    );
  },
};

// audit5-#1: wrap the worker handlers with @sentry/cloudflare's `withSentry`
// so that server-side `captureException` calls in lib/sentry.ts actually emit
// events. Without this wrap, `isInitialized()` in lib/sentry.ts returns
// `false` and every server-side error path silently drops the event. The
// options callback receives the Cloudflare `env` binding object (NOT
// `process.env`); SENTRY_DSN is plumbed through wrangler.jsonc vars /
// secrets the same way every other Worker-scoped secret is.
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
    // F-OBS-01: keep trace sampling explicit. Per-route Sentry transactions
    // overlap with our existing request logs, so 10% is the trade-off we
    // accept between cost and visibility into slow paths. Override via
    // SENTRY_TRACES_SAMPLE_RATE for incident windows.
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    // Sentry's default PII scrubbing + our own event-processor in
    // lib/sentry.ts (which strips cookies, auth headers, query strings,
    // and user email/ip) work together — `sendDefaultPii: false` is the
    // safe baseline that the per-event processor refines.
    sendDefaultPii: false,
  };
}, worker);

function parseSampleRate(raw: unknown, fallback: number): number {
  if (typeof raw !== "string" || !raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

// Re-export Durable Object classes required by OpenNext's caching layer
// @ts-expect-error -- `.open-next/worker.js` is generated at build time
export { DOQueueHandler, DOShardedTagCache } from "../.open-next/worker.js";

// F-005: Durable Object rate limiter (atomic fixed-window counter).
// Bound as RATE_LIMITER_DO in wrangler.jsonc; consumed by lib/rate-limit.ts.
export { RateLimiterDO };
