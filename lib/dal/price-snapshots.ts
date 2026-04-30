import { getTenantClient } from "@/lib/supabase-server";
import { assertRows, assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

export interface PriceSnapshotRow {
  id: string;
  product_id: string;
  site_id: string;
  price_amount: number;
  currency: string;
  source: string;
  scraped_at: string;
  created_at: string;
}

const TABLE = "price_snapshots";

/** Record a price snapshot */
export async function createPriceSnapshot(
  input: {
    product_id: string;
    site_id: string;
    price_amount: number;
    currency?: string;
    source?: string;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceSnapshotRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<PriceSnapshotRow>(data, "PriceSnapshot");
}

/** Batch-insert multiple price snapshots */
export async function createPriceSnapshots(
  inputs: {
    product_id: string;
    site_id: string;
    price_amount: number;
    currency?: string;
    source?: string;
  }[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceSnapshotRow[]> {
  if (inputs.length === 0) return [];
  const sb = await getClient();

  const { data, error } = await sb.from(TABLE).insert(inputs).select();
  if (error) throw error;
  return assertRows<PriceSnapshotRow>(data);
}

/**
 * Get price history for a product (last N days).
 *
 * A47#1: `siteId` parameter enforces tenant isolation — callers MUST pass
 * the site ID derived from the request's `x-site-id` header so a product
 * UUID belonging to tenant A cannot be queried from tenant B's hostname.
 */
export async function getPriceHistory(
  productId: string,
  days: number = 90,
  siteId?: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceSnapshotRow[]> {
  const sb = await getClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  let query = sb
    .from(TABLE)
    .select("*")
    .eq("product_id", productId)
    .gte("scraped_at", since.toISOString())
    .order("scraped_at", { ascending: true });

  // A47#1: When siteId is provided, scope the query to the requesting tenant.
  if (siteId) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return assertRows<PriceSnapshotRow>(data);
}

/** Get the latest price snapshot for a product */
export async function getLatestPrice(
  productId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceSnapshotRow | null> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("product_id", productId)
    .order("scraped_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as PriceSnapshotRow | null;
}

/** Get latest prices for multiple products (for batch display) */
export async function getLatestPricesForProducts(
  productIds: string[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Map<string, PriceSnapshotRow>> {
  if (productIds.length === 0) return new Map();
  const sb = await getClient();

  // Get the most recent snapshot per product using distinct on

  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .in("product_id", productIds)
    .order("product_id")
    .order("scraped_at", { ascending: false });

  if (error) throw error;
  const rows = assertRows<PriceSnapshotRow>(data);

  // Deduplicate: keep only the latest per product
  const map = new Map<string, PriceSnapshotRow>();
  for (const row of rows) {
    if (!map.has(row.product_id)) {
      map.set(row.product_id, row);
    }
  }
  return map;
}
