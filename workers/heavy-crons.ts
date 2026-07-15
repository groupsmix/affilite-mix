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
    // A-018: await the dispatch and throw on failure so Cloudflare marks the
    // cron as failed and applies its retry/back-off policy. Previously we used
    // ctx.waitUntil, which swallowed failures and left missed jobs unalerted.
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
      logger.error("[heavy-crons] dispatch failed", {
        job: job.name,
        status: res.status,
        body,
      });
      throw new Error(`Heavy cron dispatch failed for ${job.name}: ${res.status}`);
    }
    logger.info("[heavy-crons] dispatch responded", {
      job: job.name,
      status: res.status,
      body,
    });
  },
};

export default worker;
