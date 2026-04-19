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

/** Try to grab the Worker's ExecutionContext via @opennextjs/cloudflare. */
async function getExecutionContext(): Promise<CloudflareExecutionContextLike | undefined> {
  try {
    const mod = (await import("@opennextjs/cloudflare")) as {
      getCloudflareContext?: (opts?: {
        async?: boolean;
      }) =>
        | { ctx: CloudflareExecutionContextLike }
        | Promise<{ ctx: CloudflareExecutionContextLike }>;
    };
    if (typeof mod.getCloudflareContext !== "function") return undefined;
    const awaited = await Promise.resolve(mod.getCloudflareContext({ async: true }));
    return awaited?.ctx;
  } catch {
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

  // Fire-and-forget the Workers handoff; we never await it here so the
  // HTTP response is not delayed.
  void (async () => {
    const ctx = await getExecutionContext();
    if (ctx) {
      try {
        ctx.waitUntil(wrapped);
      } catch {
        // waitUntil can throw if the context has already been closed.
        // The `.catch()` above still protects us from an unhandled
        // rejection; just swallow this.
      }
    }
  })();

  return wrapped;
}
