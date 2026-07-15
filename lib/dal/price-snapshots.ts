import { assertRows } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

export interface PriceSnapshotRow {
  id: string;
  product_id: string;
  site_id: string;
  price_amount: number;
  currency: string;
  source: string;
  snapshot_date: string;
  scraped_at: string;
  created_at: string;
}

const TABLE = "price_snapshots";
// A23-01: Explicit column list prevents silent over-fetching.
const ALL_COLUMNS =
  "id, product_id, site_id, price_amount, currency, source, snapshot_date, scraped_at, created_at" as const;

/** Idempotently upsert multiple daily price snapshots */
export async function createPriceSnapshots(
  inputs: {
    product_id: string;
    site_id: string;
    price_amount: number;
    currency?: string;
    source?: string;
    snapshot_date?: string;
  }[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceSnapshotRow[]> {
  if (inputs.length === 0) return [];
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .upsert(inputs, { onConflict: "site_id,product_id,source,snapshot_date" })
    .select(ALL_COLUMNS);
  if (error) throw error;
  return assertRows<PriceSnapshotRow>(data);
}

/** Get price history for a product (last N days) */
export async function getPriceHistory(
  productId: string,
  siteId: string,
  days: number = 90,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PriceSnapshotRow[]> {
  const sb = await getClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("product_id", productId)
    .eq("site_id", siteId)
    .gte("scraped_at", since.toISOString())
    .order("scraped_at", { ascending: true });

  if (error) throw error;
  return assertRows<PriceSnapshotRow>(data);
}
