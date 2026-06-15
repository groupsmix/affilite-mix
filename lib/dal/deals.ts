import { assertRows } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

export interface DealRow {
  id: string;
  site_id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  discount_pct: number | null;
  original_price: number | null;
  deal_price: number | null;
  currency: string;
  source: string | null;
  url: string;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "deals";
const LIST_COLUMNS =
  "id, site_id, product_id, title, description, discount_pct, original_price, deal_price, currency, source, url, starts_at, expires_at, is_active, is_featured, created_at, updated_at" as const;

/** List active deals for a site, sorted by discount % descending */
export async function listActiveDeals(
  siteId: string,
  limit: number = 50,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<DealRow[]> {
  const sb = await getClient();
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .lte("starts_at", now)
    .order("discount_pct", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;

  // Filter out expired deals client-side (Supabase doesn't support OR NULL in same filter easily)
  const rows = assertRows<DealRow>(data);
  return rows.filter((d) => !d.expires_at || new Date(d.expires_at) > new Date());
}

/** Auto-expire deals past their expiry date.
 *
 * F-API-01: This is a cross-tenant cron sweep (hourly worker iterates every
 * site's deals at once). The privileged-client Proxy requires every awaited
 * query to either filter by `site_id` or explicitly opt out via
 * `.unsafeNoSiteFilter()`. The opt-out is the correct semantic here — the
 * caller is the cron worker, gated by `CRON_SECRET`, and a per-site fan-out
 * would multiply DB roundtrips by the number of sites for zero benefit.
 */
export async function expireDeals(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  const sb = await getClient();
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .update({ is_active: false, updated_at: now })
    // SAFE: expiry cron intentionally sweeps deals across every tenant in one batch.
    .unsafeNoSiteFilter()
    .eq("is_active", true)
    .lt("expires_at", now)
    .select("id");

  if (error) throw error;
  return (data || []).length;
}
