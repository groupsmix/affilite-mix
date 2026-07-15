/**
 * Affiliate-network commission-report adapters.
 *
 * Provides a small, network-agnostic pagination + retry wrapper around the
 * existing `fetchWithTimeout` helper. Per-network fetchers live in the cron
 * route so the raw API-to-domain mapping is co-located with the API contract.
 */

import { fetchWithTimeout } from "@/lib/fetch-timeout";

/** Retry policy tuned for third-party affiliate-network APIs. */
const NETWORK_RETRY = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  retryableStatuses: [429, 502, 503, 504],
} satisfies NonNullable<Parameters<typeof fetchWithTimeout>[1]>["retry"];

const DEFAULT_TIMEOUT_MS = 30_000;

export interface PaginatedFetchOptions<T> {
  /** Build the URL for a given 1-based page number. */
  buildUrl: (page: number) => string;
  /** Extract an array of raw items from the decoded response body. */
  extractItems: (data: unknown) => unknown[];
  /** Maximum pages to fetch before giving up to avoid runaway pagination. */
  maxPages?: number;
  requestInit?: Omit<Parameters<typeof fetchWithTimeout>[1], "retry" | "timeoutMs">;
  label: string;
}

/**
 * Fetch all pages from a network API, applying retry with jittered backoff.
 *
 * Stops when a page returns zero items, the response body cannot be parsed, or
 * `maxPages` is reached. Non-2xx responses after all retries will throw.
 */
export async function fetchPaginatedReports<T>({
  buildUrl,
  extractItems,
  maxPages = 100,
  requestInit,
  label,
}: PaginatedFetchOptions<T>): Promise<unknown[]> {
  const items: unknown[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const response = await fetchWithTimeout(buildUrl(page), {
      ...requestInit,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retry: NETWORK_RETRY,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${label} API failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${label} API returned invalid JSON: ${text.slice(0, 200)}`);
    }

    const pageItems = extractItems(data);
    if (!Array.isArray(pageItems)) {
      throw new Error(`${label} API response did not contain an array of reports`);
    }

    if (pageItems.length === 0) break;

    items.push(...pageItems);

    // Most affiliate-network APIs omit a next cursor once the final page is
    // reached; an empty page is the universal stop signal. We also cap pages.
    if (pageItems.length === 0) break;
  }

  return items;
}
