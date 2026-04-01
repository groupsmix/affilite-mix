/**
 * Custom Cloudflare Worker entry point.
 *
 * Wraps the @opennextjs/cloudflare-generated fetch handler and adds a
 * `scheduled` handler so that the cron trigger defined in wrangler.jsonc
 * actually dispatches to `/api/cron/publish`.
 *
 * NOTE: This file is compiled by wrangler at deploy time (not by Next.js/tsc),
 * so Cloudflare Worker globals (ScheduledController, ExecutionContext, etc.)
 * are available at runtime. We use `eslint-disable` and inline types to avoid
 * requiring @cloudflare/workers-types as a project dependency.
 *
 * @see https://opennext.js.org/cloudflare/howtos/custom-worker
 * @see https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// @ts-expect-error — `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

// Minimal type stubs for Cloudflare Worker APIs (provided by the runtime)
interface CloudflareScheduledController {
  cron: string;
  scheduledTime: number;
}
interface CloudflareExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export default {
  fetch: handler.fetch,

  async scheduled(
    controller: CloudflareScheduledController,
    env: Record<string, unknown>,
    ctx: CloudflareExecutionContext,
  ) {
    const cronSecret = env.CRON_SECRET;
    if (!cronSecret || typeof cronSecret !== "string") {
      console.error(
        "[scheduled] CRON_SECRET not configured — skipping cron dispatch. " +
          "Set it with: wrangler secret put CRON_SECRET",
      );
      return;
    }

    // Determine the base URL from one of the custom domain routes.
    // In Workers, there's no `self` URL, so we use the first configured domain
    // or fall back to the worker's default *.workers.dev URL.
    const baseUrl =
      typeof env.CF_PAGES_URL === "string" ? env.CF_PAGES_URL : "https://wristnerd.xyz";

    const url = `${baseUrl}/api/cron/publish`;

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
              `[scheduled] cron=${controller.cron} — /api/cron/publish responded ${res.status}:`,
              body,
            );
          } else {
            console.error(
              `[scheduled] cron=${controller.cron} — /api/cron/publish failed ${res.status}:`,
              body,
            );
          }
        })
        .catch((err: unknown) => {
          console.error(`[scheduled] cron=${controller.cron} — fetch error:`, err);
        }),
    );
  },
};

// Re-export Durable Object classes required by OpenNext's caching layer
// @ts-expect-error — `.open-next/worker.js` is generated at build time
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
