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
import { RateLimiterDO } from "./rate-limiter-do";

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
    const cronSecret = env.CRON_SECRET;
    if (!cronSecret || typeof cronSecret !== "string") {
      console.error(
        "[scheduled] CRON_SECRET not configured -- skipping cron dispatch. " +
          "Set it with: wrangler secret put CRON_SECRET",
      );
      return;
    }

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

    const CRON_ROUTES: Record<string, string> = {
      "*/5 * * * *": "/api/cron/publish",
      "0 2 * * *": "/api/cron/ai-generate",
      "0 3 * * *": "/api/cron/sitemap-refresh",
    };

    const path = CRON_ROUTES[controller.cron] ?? "/api/cron/publish";
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
   * Uses INTERNAL_API_TOKEN to authenticate (server-side only, never exposed
   * to clients). Individual message retry/ack is delegated to Cloudflare's
   * queue semantics: on a successful 2xx we ack the whole batch; on any
   * failure we retryAll so Cloudflare replays with backoff and eventually
   * routes to the dead-letter queue after max_retries.
   */
  async queue(
    batch: CloudflareMessageBatch,
    env: Record<string, unknown>,
    ctx: CloudflareExecutionContext,
  ) {
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

    const messages = batch.messages.map((m: CloudflareQueueMessage) => m.body);
    const url = `${cronHost}/api/queue/clicks`;

    ctx.waitUntil(
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${internalToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      })
        .then((res: Response) => {
          if (res.ok) {
            batch.ackAll();
          } else {
            console.error(`[queue/click-tracking] consumer returned ${res.status}`);
            batch.retryAll();
          }
        })
        .catch((err: unknown) => {
          console.error("[queue/click-tracking] consumer fetch error:", err);
          batch.retryAll();
        }),
    );
  },
};

export default worker;

// Re-export Durable Object classes required by OpenNext's caching layer
// @ts-expect-error -- `.open-next/worker.js` is generated at build time
export { DOQueueHandler, DOShardedTagCache } from "../.open-next/worker.js";

// F-005: Durable Object rate limiter (atomic fixed-window counter).
// Bound as RATE_LIMITER_DO in wrangler.jsonc; consumed by lib/rate-limit.ts.
export { RateLimiterDO };
