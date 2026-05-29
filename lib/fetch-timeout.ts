export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
  /** Next.js fetch extension for ISR / on-demand revalidation. */
  next?: { revalidate?: number | false; tags?: string[] };
  /**
   * S3-005: Retry configuration for transient failures.
   * Disabled by default to preserve existing behavior.
   */
  retry?: {
    /** Maximum number of retries (default 0 = no retries). */
    maxRetries?: number;
    /** Base delay in ms for exponential backoff (default 500). */
    baseDelayMs?: number;
    /** Maximum delay in ms (default 10000). */
    maxDelayMs?: number;
    /** HTTP status codes that are retryable (default [502, 503, 504, 429]). */
    retryableStatuses?: number[];
  };
}

/**
 * S3-005: Compute jittered exponential backoff delay.
 * Uses "full jitter" strategy: delay = random(0, min(maxDelay, base * 2^attempt)).
 */
function jitteredBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  return Math.random() * exponential;
}

const DEFAULT_RETRYABLE_STATUSES = [502, 503, 504, 429];

export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions = {}) {
  const { timeoutMs = 8000, retry, ...fetchOptions } = options;
  const maxRetries = retry?.maxRetries ?? 0;
  const baseDelayMs = retry?.baseDelayMs ?? 500;
  const maxDelayMs = retry?.maxDelayMs ?? 10_000;
  const retryableStatuses = retry?.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      if (attempt < maxRetries && retryableStatuses.includes(response.status)) {
        const delay = jitteredBackoff(attempt, baseDelayMs, maxDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = jitteredBackoff(attempt, baseDelayMs, maxDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(id);
    }
  }

  throw lastError;
}
