/**
 * OF-12: Generic fetch with exponential back-off and jitter.
 *
 * Wraps the built-in `fetch` with:
 *   - Configurable timeout per attempt (via AbortController).
 *   - Exponential back-off with full-jitter between retries.
 *   - Caller-supplied `shouldRetry` predicate (default: retry on 429/5xx).
 *
 * Usage:
 *   import { fetchWithRetry } from "@/lib/fetch-with-retry";
 *   const res = await fetchWithRetry("https://api.example.com/data", {
 *     timeoutMs: 5_000,
 *     maxAttempts: 4,
 *     baseDelayMs: 250,
 *   });
 */

export interface FetchWithRetryOptions extends RequestInit {
  /** Per-attempt timeout in milliseconds (default 8 000). */
  timeoutMs?: number;
  /** Maximum total attempts including the first try (default 3). */
  maxAttempts?: number;
  /** Base delay in milliseconds for the first retry (default 200). */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default 10 000). */
  maxDelayMs?: number;
  /**
   * Return `true` to allow another retry for this response/error.
   * Default: retry on network errors and HTTP 429/500/502/503/504.
   */
  shouldRetry?: (response: Response | null, error: unknown, attempt: number) => boolean;
}

const DEFAULT_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function defaultShouldRetry(response: Response | null, error: unknown): boolean {
  if (error) return true; // Network error — always retry.
  if (response && DEFAULT_RETRYABLE_STATUSES.has(response.status)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, maxDelayMs);
  return Math.random() * capped; // Full jitter.
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 8_000,
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 10_000,
    shouldRetry = defaultShouldRetry,
    ...fetchOptions
  } = options;

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timerId);
      lastResponse = response;
      lastError = null;

      const retry = shouldRetry(response, null, attempt);
      if (!retry || attempt === maxAttempts) {
        return response;
      }
    } catch (err) {
      clearTimeout(timerId);
      lastError = err;
      lastResponse = null;

      const retry = shouldRetry(null, err, attempt);
      if (!retry || attempt === maxAttempts) {
        throw err;
      }
    }

    const delay = jitteredDelay(attempt, baseDelayMs, maxDelayMs);
    await sleep(delay);
  }

  if (lastError) throw lastError;
  // Satisfy TypeScript — we always return or throw above.
  return lastResponse!;
}
