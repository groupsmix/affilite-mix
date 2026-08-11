import type { AffiliateClickRow } from "@/types/database";
import { assertRows } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { logger } from "@/lib/logger";
import { shouldSkipDbCall } from "@/lib/db-available";

const TABLE = "affiliate_clicks";

export interface RecordClickInput {
  site_id: string;
  product_name: string;
  affiliate_url: string;
  content_slug?: string;
  referrer?: string;
  click_id?: string;
  /**
   * Opaque per-click reference echoed to the affiliate network in its
   * tracking/sub-id parameter, so an ingested commission can be attributed
   * back to this click. Distinct from `click_id`, which is the internal
   * idempotency key for queue retries.
   */
  click_ref?: string;
  /** Product that was clicked, so an attributed commission inherits it. */
  product_id?: string;
  is_internal?: boolean;
  /** A162: /24 IP prefix only (e.g. "203.0.113"). Full IP is never stored. */
  ip_prefix?: string;
  /** A158: HMAC fingerprint for 24h dedup. Not raw PII. */
  fingerprint?: string;
}

export interface ClickDateWindow {
  since?: string;
  until?: string;
}

type DailyClicksWindow = number | ClickDateWindow;

function parseWindow(window?: ClickDateWindow): { since?: string; until?: string } {
  return {
    since: window?.since,
    until: window?.until,
  };
}

function applyCreatedAtWindow<
  TQuery extends {
    gte(column: string, value: string): TQuery;
    lte(column: string, value: string): TQuery;
    eq(column: string, value: unknown): TQuery;
  },
>(query: TQuery, window?: ClickDateWindow): TQuery {
  query = query.eq("is_internal", false);
  if (window?.since) query = query.gte("created_at", window.since);
  if (window?.until) query = query.lte("created_at", window.until);
  return query;
}

function dateKeyUtc(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

function resolveChartWindow(window: DailyClicksWindow): {
  sinceDate: Date;
  untilDate?: Date;
} {
  if (typeof window === "number") {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - window);
    return { sinceDate, untilDate: undefined };
  }

  const now = new Date();
  const sinceDate = window.since ? new Date(window.since) : new Date(now.getTime() - 30 * 86400000);
  const untilDate = window.until ? new Date(window.until) : undefined;
  return { sinceDate, untilDate };
}

export async function recordClick(
  input: RecordClickInput,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const row = {
    site_id: input.site_id,
    product_name: input.product_name,
    affiliate_url: input.affiliate_url,
    content_slug: input.content_slug ?? "",
    referrer: input.referrer ?? "",
    ...(input.click_id ? { click_id: input.click_id } : {}),
    ...(input.click_ref ? { click_ref: input.click_ref } : {}),
    ...(input.product_id ? { product_id: input.product_id } : {}),
    is_internal: input.is_internal ?? false,
    // A162: Only the /24 prefix is stored — full IP is never persisted.
    ...(input.ip_prefix ? { ip_prefix: input.ip_prefix } : {}),
    // A158: HMAC fingerprint for 24h dedup audit trail. Not raw PII.
    ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
  };

  const { error } = await sb.from(TABLE).insert(row);
  if (error) {
    logger.error("Failed to record affiliate click", { error: error.message });
  }
}

export async function getClickCount(
  siteId: string,
  since?: string,
  until?: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  if (shouldSkipDbCall()) return 0;
  const sb = await getClient();
  let query = sb.from(TABLE).select("id", { count: "exact", head: true }).eq("site_id", siteId);
  query = applyCreatedAtWindow(query, { since, until });
  const { count, error } = await query;
  if (error) {
    logger.warn("[affiliate-clicks] count unavailable", { siteId, error: error.message });
    return 0;
  }
  return count ?? 0;
}

const CLICK_COLUMNS =
  "id, click_id, click_ref, product_id, site_id, product_name, affiliate_url, content_slug, referrer, created_at" as const;

export interface ResolvedClickAttribution {
  click_id: string;
  site_id: string;
  product_id: string | null;
}

const CLICK_REF_LOOKUP_BATCH_SIZE = 500;

/**
 * Resolve per-click references reported back by an affiliate network.
 *
 * Returns the click's internal `click_id` (the value `commissions.click_id`
 * stores), its site and the product that was clicked. References that match no
 * click are simply absent from the map, leaving the commission attributed at
 * site level exactly as before.
 */
export async function resolveClicksByRefs(
  clickRefs: string[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Map<string, ResolvedClickAttribution>> {
  const uniqueRefs = Array.from(new Set(clickRefs.filter((ref) => ref !== "")));
  const resolved = new Map<string, ResolvedClickAttribution>();
  if (uniqueRefs.length === 0) return resolved;

  const sb = await getClient();
  for (let start = 0; start < uniqueRefs.length; start += CLICK_REF_LOOKUP_BATCH_SIZE) {
    const batch = uniqueRefs.slice(start, start + CLICK_REF_LOOKUP_BATCH_SIZE);
    const { data, error } = await sb
      .from(TABLE)
      .select("click_ref, click_id, site_id, product_id")
      // SAFE: commission ingestion discovers tenant identity from the network's per-click reference before site_id is known.
      .unsafeNoSiteFilter()
      .in("click_ref", batch);

    if (error) throw error;

    for (const row of (data ?? []) as {
      click_ref: string | null;
      click_id: string | null;
      site_id: string | null;
      product_id: string | null;
    }[]) {
      if (!row.click_ref || !row.click_id || !row.site_id) continue;
      resolved.set(row.click_ref, {
        click_id: row.click_id,
        site_id: row.site_id,
        product_id: row.product_id ?? null,
      });
    }
  }

  return resolved;
}

export async function getRecentClicks(
  siteId: string,
  limit = 50,
  window?: ClickDateWindow,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AffiliateClickRow[]> {
  const sb = await getClient();
  let query = sb.from(TABLE).select(CLICK_COLUMNS).eq("site_id", siteId);
  query = applyCreatedAtWindow(query, window)
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return assertRows<AffiliateClickRow>(data);
}

export async function getTopProducts(
  siteId: string,
  since?: string,
  limit = 10,
  until?: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ product_name: string; click_count: number }[]> {
  const sb = await getClient();
  const { since: sinceDate, until: untilDate } = parseWindow({ since, until });

  if (!untilDate) {
    const rpcSinceDate = sinceDate ?? new Date(0).toISOString();
    const { data, error } = await sb.rpc("get_top_products", {
      p_site_id: siteId,
      p_since: rpcSinceDate,
      p_limit: limit,
    });
    if (error) throw error;
    return assertRows<{ product_name: string; click_count: number }>(data ?? []);
  }

  let query = sb.from(TABLE).select("product_name, created_at, is_internal").eq("site_id", siteId);
  query = applyCreatedAtWindow(query, { since: sinceDate, until: untilDate });
  // BUG-8: add a hard cap to prevent unbounded full-table fetches in the
  // Cloudflare Worker runtime (128 MB memory limit). Results beyond
  // FALLBACK_ROW_CAP are truncated — the aggregation becomes approximate
  // but the worker stays alive. The RPC path (no `until`) has no cap issue.
  const { data, error } = await query.limit(10_000);
  if (error) throw error;

  const rows = assertRows<{ product_name: string }>(data ?? []);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.product_name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([product_name, click_count]) => ({ product_name, click_count }))
    .sort((a, b) => b.click_count - a.click_count || a.product_name.localeCompare(b.product_name))
    .slice(0, limit);
}

export async function getTopReferrers(
  siteId: string,
  since?: string,
  limit = 10,
  until?: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ referrer: string; click_count: number }[]> {
  const sb = await getClient();
  const { since: sinceDate, until: untilDate } = parseWindow({ since, until });

  if (!untilDate) {
    const rpcSinceDate = sinceDate ?? new Date(0).toISOString();
    const { data, error } = await sb.rpc("get_top_referrers", {
      p_site_id: siteId,
      p_since: rpcSinceDate,
      p_limit: limit,
    });
    if (error) throw error;
    return assertRows<{ referrer: string; click_count: number }>(data ?? []);
  }

  let query = sb.from(TABLE).select("referrer, created_at, is_internal").eq("site_id", siteId);
  query = applyCreatedAtWindow(query, { since: sinceDate, until: untilDate });
  const { data, error } = await query.limit(10_000);
  if (error) throw error;

  const rows = assertRows<{ referrer: string }>(data ?? []);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.referrer && row.referrer.trim() ? row.referrer : "(direct)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([referrer, click_count]) => ({ referrer, click_count }))
    .sort((a, b) => b.click_count - a.click_count || a.referrer.localeCompare(b.referrer))
    .slice(0, limit);
}

export async function getTopContentSlugs(
  siteId: string,
  since?: string,
  limit = 10,
  until?: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ content_slug: string; click_count: number }[]> {
  const sb = await getClient();
  const { since: sinceDate, until: untilDate } = parseWindow({ since, until });

  if (!untilDate) {
    const rpcSinceDate = sinceDate ?? new Date(0).toISOString();
    const { data, error } = await sb.rpc("get_top_content_slugs", {
      p_site_id: siteId,
      p_since: rpcSinceDate,
      p_limit: limit,
    });
    if (error) throw error;
    return assertRows<{ content_slug: string; click_count: number }>(data ?? []);
  }

  let query = sb.from(TABLE).select("content_slug, created_at, is_internal").eq("site_id", siteId);
  query = applyCreatedAtWindow(query, { since: sinceDate, until: untilDate });
  const { data, error } = await query.limit(10_000);
  if (error) throw error;

  const rows = assertRows<{ content_slug: string }>(data ?? []);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.content_slug?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([content_slug, click_count]) => ({ content_slug, click_count }))
    .sort((a, b) => b.click_count - a.click_count || a.content_slug.localeCompare(b.content_slug))
    .slice(0, limit);
}

export async function getDailyClicks(
  siteId: string,
  daysOrWindow: DailyClicksWindow = 30,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ date: string; count: number }[]> {
  const sb = await getClient();
  const { sinceDate, untilDate } = resolveChartWindow(daysOrWindow);

  if (!untilDate) {
    const { data, error } = await sb.rpc("get_daily_clicks", {
      p_site_id: siteId,
      p_since: sinceDate.toISOString(),
    });
    if (error) throw error;

    const rpcData = assertRows<{ date: string; count: number }>(data ?? []);
    const counts = new Map<string, number>();
    for (const row of rpcData) {
      counts.set(row.date, Number(row.count));
    }

    const result: { date: string; count: number }[] = [];
    const cursor = new Date(sinceDate);
    const today = new Date();
    while (cursor <= today) {
      const dateStr = cursor.toISOString().split("T")[0];
      result.push({ date: dateStr!, count: counts.get(dateStr!) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  let query = sb.from(TABLE).select("created_at, is_internal").eq("site_id", siteId);
  query = applyCreatedAtWindow(query, {
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });
  const { data, error } = await query.limit(10_000);
  if (error) throw error;

  const rows = assertRows<{ created_at: string }>(data ?? []);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = new Date(row.created_at);
    const key = dateKeyUtc(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: { date: string; count: number }[] = [];
  const cursor = startOfUtcDay(sinceDate);
  const end = startOfUtcDay(untilDate);
  while (cursor <= end) {
    const dateStr = dateKeyUtc(cursor);
    result.push({ date: dateStr, count: counts.get(dateStr) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
