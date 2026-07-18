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
  retryableStatuses: [429, 500, 502, 503, 504],
} satisfies NonNullable<Parameters<typeof fetchWithTimeout>[1]>["retry"];

const DEFAULT_TIMEOUT_MS = 30_000;

export interface PaginatedFetchOptions {
  /** Build the URL for a given 1-based page number. */
  buildUrl: (page: number) => string;
  /** Extract the raw items field from the decoded response body. */
  extractItems: (data: unknown) => unknown;
  /** Maximum pages to fetch before giving up to avoid runaway pagination. */
  maxPages?: number;
  requestInit?: Omit<Parameters<typeof fetchWithTimeout>[1], "retry" | "timeoutMs">;
  label: string;
}

/**
 * Fetch all pages from a network API, applying retry with jittered backoff.
 *
 * Stops when a page returns zero items or `maxPages` is reached. Invalid
 * response bodies and non-2xx responses after all retries throw.
 */
export async function fetchPaginatedReports({
  buildUrl,
  extractItems,
  maxPages = 100,
  requestInit,
  label,
}: PaginatedFetchOptions): Promise<unknown[]> {
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

    if (page === maxPages) {
      throw new Error(`${label} API pagination reached the ${maxPages}-page safety limit`);
    }
  }

  return items;
}

function recordOrNull(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

export function normalizeCjCommission(input: unknown): unknown {
  const raw = recordOrNull(input);
  if (!raw) return input;

  return {
    tracking_key: raw.shopperId,
    order_id: raw.actionId,
    network: "cj",
    commission_amount: raw.pubCommissionAmountUsd,
    sale_amount: raw.saleAmountUsd,
    status: raw.actionStatus,
    event_date: raw.eventDate,
    raw_data: raw,
  };
}

export function normalizeAdmitadCommission(input: unknown): unknown {
  const raw = recordOrNull(input);
  if (!raw) return input;

  return {
    tracking_key: raw.subid,
    order_id: typeof raw.id === "number" ? String(raw.id) : raw.id,
    network: "admitad",
    commission_amount: raw.payment,
    currency: raw.currency,
    status: raw.status,
    event_date: raw.action_date,
    raw_data: raw,
  };
}

export function normalizePartnerStackCommission(input: unknown): unknown {
  const raw = recordOrNull(input);
  if (!raw) return input;

  return {
    tracking_key: raw.customer_key,
    order_id: raw.key,
    network: "partnerstack",
    commission_amount: raw.amount,
    currency: raw.currency,
    status: raw.status,
    event_date: raw.created_at,
    raw_data: raw,
  };
}
