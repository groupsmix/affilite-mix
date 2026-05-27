import { assertRows, assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

interface CommissionRow {
  id: string;
  site_id: string;
  product_id: string | null;
  network: string;
  order_id: string | null;
  click_id: string | null;
  commission_amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected" | "paid";
  sale_amount: number | null;
  event_date: string;
  ingested_at: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ProductEpcRow {
  id: string;
  product_id: string;
  network: string;
  clicks_30d: number;
  commissions_30d: number;
  epc_30d: number;
  clicks_7d: number;
  commissions_7d: number;
  epc_7d: number;
  updated_at: string;
}

const COMMISSION_TABLE = "commissions";
const EPC_TABLE = "product_epc_stats";
const COMMISSION_COLUMNS =
  "id, site_id, product_id, network, order_id, click_id, commission_amount, currency, status, sale_amount, event_date, ingested_at, network_transaction_id, network_status, network_sale_amount, items_count, customer_country, raw_data, created_at" as const;
const EPC_COLUMNS =
  "id, product_id, network, clicks_30d, commissions_30d, epc_30d, clicks_7d, commissions_7d, epc_7d, updated_at" as const;

/** Ingest a batch of commission reports (with dedup) */
export async function ingestCommissions(
  reports: {
    site_id: string;
    product_id?: string;
    network: string;
    order_id?: string;
    click_id?: string;
    commission_amount: number;
    currency?: string;
    status?: string;
    sale_amount?: number;
    event_date: string;
    raw_data?: Record<string, unknown>;
  }[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ inserted: number; skipped: number }> {
  if (reports.length === 0) return { inserted: 0, skipped: 0 };

  const sb = await getClient();
  let inserted = 0;
  let skipped = 0;

  // Insert one at a time to handle dedup gracefully
  for (const report of reports) {
    const { error } = await sb.from(COMMISSION_TABLE).insert(report).select().single();

    if (error) {
      if (error.code === "23505") {
        // Duplicate — skip
        skipped++;
      } else {
        throw error;
      }
    } else {
      inserted++;
    }
  }

  return { inserted, skipped };
}

/** Get commission stats for a date range */
async function getCommissionStats(
  siteId: string,
  startDate: string,
  endDate: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<CommissionRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(COMMISSION_TABLE)
    .select(COMMISSION_COLUMNS)
    .eq("site_id", siteId)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: false });

  if (error) throw error;
  return assertRows<CommissionRow>(data);
}

/** Upsert EPC stats for a product+network */
export async function upsertProductEpc(
  input: {
    product_id: string;
    network: string;
    clicks_30d: number;
    commissions_30d: number;
    epc_30d: number;
    clicks_7d: number;
    commissions_7d: number;
    epc_7d: number;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductEpcRow> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(EPC_TABLE)
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: "product_id,network" },
    )
    .select()
    .single();

  if (error) throw error;
  return assertRow<ProductEpcRow>(data, "ProductEpc");
}

/** Get EPC stats for a product (all networks) */
async function getProductEpcStats(
  productId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductEpcRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(EPC_TABLE)
    .select(EPC_COLUMNS)
    .eq("product_id", productId)
    .order("epc_30d", { ascending: false });

  if (error) throw error;
  return assertRows<ProductEpcRow>(data);
}

/**
 * Pick the best network for a product based on EPC.
 * Used by the /r/[shortcode] router to maximize revenue.
 */
async function getBestNetworkByEpc(
  productId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ network: string; epc: number } | null> {
  const stats = await getProductEpcStats(productId, getClient);
  if (stats.length === 0) return null;

  // Prefer 7-day EPC if enough data, otherwise 30-day
  const best = stats[0];
  const epc = best.clicks_7d >= 10 ? best.epc_7d : best.epc_30d;
  return { network: best.network, epc };
}
