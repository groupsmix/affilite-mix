import { getServiceClient } from "@/lib/supabase-server";
import type { AffiliateClickRow } from "@/types/database";
import { assertRows } from "./type-guards";

const TABLE = "affiliate_clicks";

export interface RecordClickInput {
  site_id: string;
  product_name: string;
  affiliate_url: string;
  content_slug?: string;
  referrer?: string;
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
  },
>(query: TQuery, window?: ClickDateWindow): TQuery {
  if (window?.since) query = query.gte("created_at", window.since);
  if (window?.until) query = query.lte("created_at", window.until);
  return query;
}

function dateKeyUtc(date: Date): string {
  return date.toISOString().split("T")[0];
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

/** Record an affiliate click (fire-and-forget) */
export async function recordClick(input: RecordClickInput): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).insert({
    site_id: input.site_id,
    product_name: input.product_name,
    affiliate_url: input.affiliate_url,
    content_slug: input.content_slug ?? "",
    referrer: input.referrer ?? "",
  });

  // Fire-and-forget: log but don't throw
  if (error) {
    console.error("Failed to record affiliate click:", error.message);
  }
}

/** Get click count for a site (admin analytics) */
export async function getClickCount(
  siteId: string,
  since?: string,
  until?: string,
): Promise<number> {
  const sb = getServiceClient();
  let query = sb.from(TABLE).select("id", { count: "exact", head: true }).eq("site_id", siteId);

  query = applyCreatedAtWindow(query, { since, until });

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Columns returned for click listings */
const CLICK_COLUMNS =
  "id, site_id, product_name, affiliate_url, content_slug, referrer, created_at" as const;

/** Get recent clicks for a site (admin) */
export async function getRecentClicks(
  siteId: string,
  limit = 50,
  window?: ClickDateWindow,
): Promise<AffiliateClickRow[]> {
  const sb = getServiceClient();
  let query = sb.from(TABLE).select(CLICK_COLUMNS).eq("site_id", siteId);

  query = applyCreatedAtWindow(query, window)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  return assertRows<AffiliateClickRow>(data);
}

/** Get top clicked products for a site (admin analytics) */
export async function getTopProducts(
  siteId: string,
  since?: string,
  limit = 10,
  until?: string,
): Promise<{ product_name: string; click_count: number }[]> {
  const sb = getServiceClient();
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

  let query = sb.from(TABLE).select("product_name, created_at").eq("site_id", siteId);

  query = applyCreatedAtWindow(query, { since: sinceDate, until: untilDate });

  const { data, error } = await query;
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

/** Get top referring pages for a site (admin analytics) */
export async function getTopReferrers(
  siteId: string,
  since?: string,
  limit = 10,
  until?: string,
): Promise<{ referrer: string; click_count: number }[]> {
  const sb = getServiceClient();
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

  let query = sb.from(TABLE).select("referrer, created_at").eq("site_id", siteId);

  query = applyCreatedAtWindow(query, { since: sinceDate, until: untilDate });

  const { data, error } = await query;
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

/** Get top content pages driving clicks (admin analytics) */
export async function getTopContentSlugs(
  siteId: string,
  since?: string,
  limit = 10,
  until?: string,
): Promise<{ content_slug: string; click_count: number }[]> {
  const sb = getServiceClient();
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

  let query = sb.from(TABLE).select("content_slug, created_at").eq("site_id", siteId);

  query = applyCreatedAtWindow(query, { since: sinceDate, until: untilDate });

  const { data, error } = await query;
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

/** Get daily click counts for a site (admin analytics chart data) */
export async function getDailyClicks(
  siteId: string,
  daysOrWindow: DailyClicksWindow = 30,
): Promise<{ date: string; count: number }[]> {
  const sb = getServiceClient();
  const { sinceDate, untilDate } = resolveChartWindow(daysOrWindow);

  if (!untilDate) {
    const { data, error } = await sb.rpc("get_daily_clicks", {
      p_site_id: siteId,
      p_since: sinceDate.toISOString(),
    });

    if (error) throw error;

    // Build a lookup from the RPC results
    const rpcData = assertRows<{ date: string; count: number }>(data ?? []);
    const counts = new Map<string, number>();
    for (const row of rpcData) {
      counts.set(row.date, Number(row.count));
    }

    // Fill missing dates with 0
    const result: { date: string; count: number }[] = [];
    const cursor = new Date(sinceDate);
    const today = new Date();
    while (cursor <= today) {
      const dateStr = cursor.toISOString().split("T")[0];
      result.push({ date: dateStr, count: counts.get(dateStr) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }

  let query = sb.from(TABLE).select("created_at").eq("site_id", siteId);

  query = applyCreatedAtWindow(query, {
    since: sinceDate.toISOString(),
    until: untilDate.toISOString(),
  });

  const { data, error } = await query;
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
