import { assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

export interface ProductEpcRow {
  id: string;
  site_id: string;
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

/** Upsert EPC stats for a product+network */
export async function upsertProductEpc(
  input: {
    site_id: string;
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
      { onConflict: "site_id,product_id,network" },
    )
    .select()
    .single();

  if (error) throw error;
  return assertRow<ProductEpcRow>(data, "ProductEpc");
}
