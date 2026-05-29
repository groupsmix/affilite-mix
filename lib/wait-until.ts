/**
 * Best-effort ctx.waitUntil() for fire-and-forget side effects on
 * Cloudflare Workers.
 *
 * On Workers, once the Response is returned the isolate can be killed
 * at any moment.  Unawaited promises (e.g. analytics writes, click
 * tracking, ad impressions) are dropped the instant the response is
 * sent, so a significant fraction of events are silently lost under
 * load.  `ctx.waitUntil()` tells the runtime to keep the isolate alive
 * until the promise settles.
 *
 * Outside the Workers runtime (local `next dev`, unit tests, any Node
 * environment) there is no execution context to extend.  In that case
 * we attach a `.catch()` so an unhandled rejection is still logged and
 * return the original promise so callers can still `await` it if they
 * want to.
 *
 * Usage:
 *     runAfterResponse(recordClick({...}), { context: "click-track" });
 */
import { captureException } from "@/lib/sentry";

interface CloudflareExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Eagerly resolve the Worker's ExecutionContext at module load time.
 *
 * NEW-02: The previous implementation resolved this asynchronously inside an
 * unawaited IIFE, meaning `ctx.waitUntil()` could fire after the response
 * was already sent and the execution context was closing.  On Cloudflare
 * Workers, `waitUntil()` must be called synchronously within the fetch
 * handler (or inside an already-registered waitUntil chain).
 *
 * `getCloudflareContext()` (without `{ async: true }`) returns synchronously
 * when called within a request handler, so `runAfterResponse` can call
 * `waitUntil()` synchronously.  Not cached — the context is per-request.
 */
function getExecutionContextSync(): CloudflareExecutionContextLike | undefined {
  try {
    const mod = require("@opennextjs/cloudflare") as {
      getCloudflareContext?: () => { ctx: CloudflareExecutionContextLike };
    };
    if (typeof mod.getCloudflareContext !== "function") return undefined;
    const result = mod.getCloudflareContext();
    return result?.ctx;
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return undefined;
  }
}

export interface RunAfterResponseOptions {
  /** Short label used when logging unhandled rejections. */
  context?: string;
}

/**
 * Run `promise` to completion after the HTTP response has been returned,
 * without blocking the response itself.  On Cloudflare Workers this uses
 * `ctx.waitUntil()` so the isolate is not killed before the promise
 * settles.  Anywhere else it just attaches a `.catch()` so rejections
 * are observable.
 */
export function runAfterResponse<T>(
  promise: Promise<T> | T,
  options: RunAfterResponseOptions = {},
): Promise<T> {
  // Tolerate non-Promise inputs (e.g. a DAL mock that returns undefined
  // synchronously in tests, or a function that returned a plain value).
  // Promise.resolve() is a no-op for real promises and wraps anything
  // else, giving us a uniform `.catch()` surface below.
  const wrapped = Promise.resolve(promise).catch((err) => {
    captureException(err, { context: options.context ?? "runAfterResponse" });
    throw err;
  });

  // NEW-02: Call waitUntil synchronously so it is registered before the
  // response is returned, matching the pattern in custom-worker.ts.
  const ctx = getExecutionContextSync();
  if (ctx) {
    try {
      ctx.waitUntil(wrapped);
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // waitUntil can throw if the context has already been closed.
    }
  }

  return wrapped;
}
