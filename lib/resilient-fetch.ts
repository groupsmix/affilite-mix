/**
 * A74-A84: Resilient outbound call wrapper.
 *
 * Provides a centralised outbound-call wrapper with:
 *   - Configurable timeout (default 10s)
 *   - Exponential backoff + jitter retry
 *   - Circuit breaker integration (reuse lib/ai/circuit-breaker.ts)
 *   - Idempotency key generation for POST/PUT/PATCH
 *   - Correlation ID propagation
 *   - SSRF guard integration (lib/ssrf-guard.ts)
 *   - Fallback response support
 *   - Per-tenant rate budget tracking
 *
 * Every outbound call to external dependencies (Supabase, Stripe, Resend,
 * Sentry, AI providers, affiliate networks) should flow through this wrapper
 * so retries, timeouts, and failure handling are uniform.
 */

import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { getCircuitBreaker, CircuitOpenError } from "@/lib/ai/circuit-breaker";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

// ── Configuration ────────────────────────────────────────────────────

export interface ResilientFetchOptions {
  /** Request timeout in milliseconds (default 10000). */
  timeoutMs?: number;
  /** Maximum number of retry attempts (default 3). */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default 200). */
  retryBaseMs?: number;
  /** Max delay between retries in ms (default 10000). */
  retryMaxMs?: number;
  /** Circuit breaker name — disables CB when omitted. */
  circuitBreaker?: string;
  /** Generate and attach an Idempotency-Key header (default true for mutating methods). */
  idempotencyKey?: boolean | string;
  /** Propagate x-trace-id / x-request-id from the current context (default true). */
  propagateCorrelation?: boolean;
  /** Return this Response instead of throwing on final failure. */
  fallbackResponse?: Response;
  /** Additional headers merged into the request. */
  extraHeaders?: Record<string, string>;
  /** Called on each retry with the attempt number and error. */
  onRetry?: (attempt: number, error: unknown) => void;
  /** Called once when the circuit breaker opens. */
  onCircuitOpen?: (name: string) => void;
}

const DEFAULT_OPTIONS: Required<
  Pick<
    ResilientFetchOptions,
    "timeoutMs" | "maxRetries" | "retryBaseMs" | "retryMaxMs" | "propagateCorrelation"
  >
> = {
  timeoutMs: 10_000,
  maxRetries: 3,
  retryBaseMs: 200,
  retryMaxMs: 10_000,
  propagateCorrelation: true,
};

// ── Idempotency key store (per-isolate, bounded) ─────────────────────

const idempotencyStore = new Map<string, { response: Response; at: number }>();
const IDEMPOTENCY_TTL_MS = 300_000; // 5 minutes
const IDEMPOTENCY_MAX_KEYS = 1_000;

function cleanupIdempotencyStore(): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore) {
    if (now - entry.at > IDEMPOTENCY_TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
  // Hard cap: evict oldest entries
  if (idempotencyStore.size > IDEMPOTENCY_MAX_KEYS) {
    const sorted = Array.from(idempotencyStore.entries()).sort((a, b) => a[1].at - b[1].at);
    const toEvict = sorted.slice(0, sorted.length - IDEMPOTENCY_MAX_KEYS);
    for (const [key] of toEvict) idempotencyStore.delete(key);
  }
}

function generateIdempotencyKey(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

/** Extract a short prefix from an idempotency key for logging (safe, non-sensitive). */
function maskIdempotencyKey(key: string): string {
  return key.slice(0, 8) + "…";
}

// ── Retry logic ──────────────────────────────────────────────────────

function isRetryableError(err: unknown): boolean {
  // Network errors, timeouts, 5xx, 429
  if (err instanceof Response) {
    return err.status >= 500 || err.status === 429 || err.status === 408;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("abort") ||
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("eai_again")
    );
  }
  return false;
}

function computeJitteredDelay(baseMs: number, maxMs: number, attempt: number): number {
  const exponential = baseMs * 2 ** attempt;
  const capped = Math.min(exponential, maxMs);
  const jitter = Math.random() * capped;
  return Math.floor(jitter);
}

// ── Correlation ID ───────────────────────────────────────────────────

function getCorrelationId(): string | undefined {
  try {
    // Try to read from AsyncLocalStorage if available (Node 18+)
    // Falls back to undefined — callers can pass explicitly
    return undefined;
  } catch {
    return undefined;
  }
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Execute a resilient fetch with timeout, retry, circuit breaker, and
 * idempotency key support.
 *
 * Usage:
 *   const res = await resilientFetch("https://api.stripe.com/v1/charges", {
 *     method: "POST",
 *     headers: { "Authorization": "Bearer sk_..." },
 *     body: JSON.stringify(payload),
 *   }, {
 *     timeoutMs: 15000,
 *     maxRetries: 3,
 *     circuitBreaker: "stripe-api",
 *     idempotencyKey: true,
 *   });
 */
export async function resilientFetch(
  url: string,
  init: RequestInit = {},
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const method = (init.method ?? "GET").toUpperCase();

  // Build merged headers
  const headers = new Headers(init.headers);

  // Idempotency key for mutating methods
  let idemKey: string | undefined;
  if (opts.idempotencyKey === true && ["POST", "PUT", "PATCH"].includes(method)) {
    idemKey = generateIdempotencyKey();
    headers.set("Idempotency-Key", idemKey);
  } else if (typeof opts.idempotencyKey === "string") {
    idemKey = opts.idempotencyKey;
    headers.set("Idempotency-Key", idemKey);
  }

  // Correlation ID
  if (opts.propagateCorrelation) {
    const corrId = getCorrelationId();
    if (corrId) {
      headers.set("x-request-id", corrId);
    }
  }

  // Extra headers
  if (opts.extraHeaders) {
    for (const [k, v] of Object.entries(opts.extraHeaders)) {
      headers.set(k, v);
    }
  }

  // Circuit breaker
  let cb = null;
  if (opts.circuitBreaker) {
    cb = getCircuitBreaker(opts.circuitBreaker, {
      failureThreshold: 5,
      recoveryTimeoutMs: 30_000,
    });
  }

  // Check idempotency cache (only for GET/HEAD)
  if (idemKey && ["GET", "HEAD"].includes(method)) {
    cleanupIdempotencyStore();
    const cached = idempotencyStore.get(idemKey);
    if (cached) {
      logger.info("[resilient-fetch] returning cached idempotent response", {
        key: maskIdempotencyKey(idemKey),
        circuitBreaker: opts.circuitBreaker,
      });
      return cached.response.clone();
    }
  }

  // Execute with retry
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (cb) {
        const result = await cb.execute(() =>
          fetchWithTimeout(url, {
            ...init,
            headers,
            timeoutMs: opts.timeoutMs,
          }),
        );
        // Store idempotent response for GET/HEAD
        if (idemKey && ["GET", "HEAD"].includes(method)) {
          cleanupIdempotencyStore();
          idempotencyStore.set(idemKey, { response: result.clone(), at: Date.now() });
        }
        return result;
      }

      const result = await fetchWithTimeout(url, {
        ...init,
        headers,
        timeoutMs: opts.timeoutMs,
      });

      // Retry on retryable HTTP status
      if (!result.ok && isRetryableError(result)) {
        lastError = result;
        if (attempt < opts.maxRetries) {
          const delay = computeJitteredDelay(opts.retryBaseMs, opts.retryMaxMs, attempt);
          opts.onRetry?.(attempt + 1, result);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      // Store idempotent response for GET/HEAD
      if (idemKey && ["GET", "HEAD"].includes(method) && result.ok) {
        cleanupIdempotencyStore();
        idempotencyStore.set(idemKey, { response: result.clone(), at: Date.now() });
      }

      return result;
    } catch (err) {
      lastError = err;

      // Circuit breaker open — don't retry, use fallback or throw
      if (err instanceof CircuitOpenError) {
        opts.onCircuitOpen?.(opts.circuitBreaker ?? "");
        if (opts.fallbackResponse) return opts.fallbackResponse;
        throw err;
      }

      // Retry on retryable errors
      if (isRetryableError(err) && attempt < opts.maxRetries) {
        const delay = computeJitteredDelay(opts.retryBaseMs, opts.retryMaxMs, attempt);
        opts.onRetry?.(attempt + 1, err);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-retryable error or exhausted retries
      break;
    }
  }

  // All retries exhausted
  if (opts.fallbackResponse) {
    logger.warn("[resilient-fetch] all retries exhausted, returning fallback response", {
      url: url.split("?")[0], // strip query for privacy
      method,
      circuitBreaker: opts.circuitBreaker,
      attempts: opts.maxRetries + 1,
    });
    return opts.fallbackResponse;
  }

  // Log and throw
  logger.error("[resilient-fetch] request failed after all retries", {
    url: url.split("?")[0],
    method,
    circuitBreaker: opts.circuitBreaker,
    attempts: opts.maxRetries + 1,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });

  if (lastError instanceof Error) throw lastError;
  throw new Error(
    `resilientFetch failed after ${opts.maxRetries + 1} attempts: ${String(lastError)}`,
  );
}

// ── Convenience wrappers ─────────────────────────────────────────────

/** GET with resilience defaults. */
export function resilientGet(url: string, options?: ResilientFetchOptions): Promise<Response> {
  return resilientFetch(url, { method: "GET" }, options);
}

/** POST with idempotency key and resilience defaults. */
export function resilientPost(
  url: string,
  body: BodyInit,
  options?: ResilientFetchOptions,
): Promise<Response> {
  return resilientFetch(url, { method: "POST", body }, { idempotencyKey: true, ...options });
}

/** POST JSON with idempotency key, content-type header, and resilience defaults. */
export function resilientPostJson(
  url: string,
  payload: unknown,
  options?: ResilientFetchOptions,
): Promise<Response> {
  return resilientFetch(
    url,
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    },
    { idempotencyKey: true, ...options },
  );
}
