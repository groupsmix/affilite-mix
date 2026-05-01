/**
 * OF-13: Generic retry-with-exponential-backoff-and-jitter wrapper.
 *
 * Wraps fetchWithTimeout (or any fetch-like function) with:
 *  - Configurable retry count and base delay
 *  - Full jitter to avoid thundering herd
 *  - Retries only on transient errors (network errors or 5xx responses)
 */

import { fetchWithTimeout } from "@/lib/fetch-timeout";

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms before first retry (default: 200) */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default: 10_000) */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry (default: 429, 500, 502, 503, 504) */
  retryStatuses?: number[];
  /** Timeout per attempt in ms (default: 10_000) */
  timeoutMs?: number;
}

const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504];

function jitteredDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  // Full jitter: random between 0 and exponential ceiling
  return Math.floor(Math.random() * exponential);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with automatic retry on transient failures.
 *
 * @example
 * const res = await fetchWithRetry("https://api.example.com/data", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ key: "value" }),
 * });
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 10_000,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    timeoutMs = 10_000,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      if (!retryStatuses.includes(response.status)) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (err) {
      // Network-level error — always retry
      lastError = err;
    }

    if (attempt < maxAttempts - 1) {
      const delay = jitteredDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError;
}
