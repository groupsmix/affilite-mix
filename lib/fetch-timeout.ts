/**
 * Fetch with a per-request timeout via AbortController.
 *
 * For calls that also need automatic retry with exponential back-off,
 * use {@link fetchWithRetry} from `@/lib/fetch-with-retry` instead.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
) {
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * OF-12: Re-export the retry helper so callers can import from either
 * `@/lib/fetch-timeout` or `@/lib/fetch-with-retry`.
 */
export { fetchWithRetry, type FetchWithRetryOptions } from "./fetch-with-retry";
