/**
 * F-005: Durable Object rate limiter.
 *
 * Atomic fixed-window counter backed by a Durable Object's per-object
 * SQLite storage. DOs provide serialised, single-threaded access to storage
 * for a given object ID, so the read-then-increment race that exists in the
 * KV-based limiter (lib/rate-limit.ts) is closed here.
 *
 * Request contract:
 *   POST /check
 *   body: { "key": string, "maxRequests": number, "windowMs": number }
 *   resp: { allowed: boolean, remaining: number, retryAfterMs: number }
 *
 * The object ID is derived from `key` (see RateLimiterClient.check), so all
 * requests for the same key hit the same DO instance and see consistent
 * counter values.
 *
 * Wrangler binding (wrangler.jsonc):
 *   durable_objects.bindings: { name: "RATE_LIMITER_DO", class_name: "RateLimiterDO" }
 *   migrations: { tag: "vN", new_sqlite_classes: ["RateLimiterDO"] }
 *
 * The class is re-exported from workers/custom-worker.ts so the compiled
 * OpenNext worker bundle surfaces it to the Cloudflare runtime.
 */

interface DOStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

interface DOState {
  storage: DOStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

interface CheckRequestBody {
  /**
   * The rate-limit key. This field is used externally to derive the Durable
   * Object ID (so all requests for the same key route to the same DO instance)
   * but is intentionally NOT read inside the DO itself — the routing already
   * guarantees per-key isolation.
   */
  key: string;
  maxRequests: number;
  windowMs: number;
}

interface CheckResponseBody {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

const COUNT_KEY = "count";
const WINDOW_KEY = "windowStart";

export class RateLimiterDO {
  private state: DOState;

  constructor(state: DOState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/check") {
      return new Response("Not found", { status: 404 });
    }

    // Guard against oversized request bodies (e.g. misconfigured client or
    // accidental large payload). The DO is internal-only, so a tiny limit is safe.
    const MAX_BODY_BYTES = 4096;
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return new Response("Request body too large", { status: 413 });
    }

    let body: CheckRequestBody;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) {
        return new Response("Request body too large", { status: 413 });
      }
      body = JSON.parse(text) as CheckRequestBody;
    } catch {
      // fail-closed: malformed request body is rejected
      return new Response("Invalid JSON body", { status: 400 });
    }

    if (
      typeof body.maxRequests !== "number" ||
      body.maxRequests <= 0 ||
      typeof body.windowMs !== "number" ||
      body.windowMs <= 0
    ) {
      return new Response("Invalid rate limit config", { status: 400 });
    }

    const result = await this.state.blockConcurrencyWhile(() =>
      this.increment(body.maxRequests, body.windowMs),
    );

    return Response.json(result satisfies CheckResponseBody);
  }

  private async increment(maxRequests: number, windowMs: number): Promise<CheckResponseBody> {
    const now = Date.now();
    const windowId = Math.floor(now / windowMs);

    const storedWindow = await this.state.storage.get<number>(WINDOW_KEY);
    let count = (await this.state.storage.get<number>(COUNT_KEY)) ?? 0;

    // Roll the window on first sight (storedWindow unset) or when we've
    // advanced to a new bucket. Persisting WINDOW_KEY unconditionally on the
    // first request is what makes the fixed-window roll work: without it the
    // key stayed unset, `storedWindow !== windowId` was never reached, and the
    // reset depended solely on the cleanup alarm.
    if (storedWindow === undefined || storedWindow !== windowId) {
      count = 0;
      await this.state.storage.put(WINDOW_KEY, windowId);
    }

    if (count >= maxRequests) {
      const windowStart = windowId * windowMs;
      const windowEnd = windowStart + windowMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(windowEnd - now, 0),
      };
    }

    const nextCount = count + 1;
    await this.state.storage.put(COUNT_KEY, nextCount);

    // Schedule cleanup at the end of the window so idle objects don't
    // hold storage indefinitely.
    const windowEnd = (windowId + 1) * windowMs;
    await this.state.storage.setAlarm(windowEnd + 1000);

    return {
      allowed: true,
      remaining: maxRequests - nextCount,
      retryAfterMs: 0,
    };
  }

  async alarm(): Promise<void> {
    await this.state.storage.delete(COUNT_KEY);
    await this.state.storage.delete(WINDOW_KEY);
  }
}
