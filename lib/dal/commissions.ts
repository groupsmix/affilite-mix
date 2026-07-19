import { createHash } from "crypto";
import { assertRow, assertRows } from "./type-guards";
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
const COMMISSION_BATCH_SIZE = 200;

/**
 * Deterministic synthetic order_id for commission reports whose network did not
 * supply one (Bug 6). It is a pure function of the report's identifying fields,
 * so re-ingesting the same logical sale yields the same key and the
 * (network, order_id) unique index dedups it instead of inserting a duplicate
 * row on every nightly run. Exported for unit testing.
 */
export function syntheticOrderId(report: {
  network: string;
  product_id?: string;
  click_id?: string;
  commission_amount: number;
  sale_amount?: number;
  event_date: string;
}): string {
  const basis = [
    report.network,
    report.product_id ?? "",
    report.click_id ?? "",
    report.commission_amount,
    report.sale_amount ?? "",
    report.event_date,
  ].join("|");
  const digest = createHash("sha256").update(basis).digest("hex").slice(0, 24);
  return `syn_${digest}`;
}

/** Ingest a batch of commission reports (upsert with dedup) */
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
  const rowsByKey = new Map<
    string,
    (typeof reports)[number] & {
      order_id: string;
    }
  >();

  for (const report of reports) {
    const order_id = report.order_id ?? syntheticOrderId(report);
    const row = { ...report, order_id };
    const key = `${row.site_id}\u0000${row.network}\u0000${order_id}`;
    if (rowsByKey.has(key)) skipped++;
    rowsByKey.set(key, row);
  }

  const rows = Array.from(rowsByKey.values());
  for (let start = 0; start < rows.length; start += COMMISSION_BATCH_SIZE) {
    const batch = rows.slice(start, start + COMMISSION_BATCH_SIZE);
    const siteIds = Array.from(new Set(batch.map((row) => row.site_id)));
    const networks = Array.from(new Set(batch.map((row) => row.network)));
    const orderIds = batch.map((row) => row.order_id);
    const batchKeys = new Set(
      batch.map((row) => `${row.site_id}\u0000${row.network}\u0000${row.order_id}`),
    );

    const { data: existingRows, error: lookupError } = await sb
      .from(COMMISSION_TABLE)
      .select("site_id, network, order_id")
      .in("site_id", siteIds)
      .in("network", networks)
      .in("order_id", orderIds);

    if (lookupError) throw lookupError;

    const existingKeys = new Set(
      ((existingRows ?? []) as { site_id: string; network: string; order_id: string }[])
        .map((row) => `${row.site_id}\u0000${row.network}\u0000${row.order_id}`)
        .filter((key) => batchKeys.has(key)),
    );

    const { error } = await sb
      .from(COMMISSION_TABLE)
      .upsert(batch, { onConflict: "site_id,network,order_id" })
      .select("id");

    if (error) throw error;

    for (const row of batch) {
      const key = `${row.site_id}\u0000${row.network}\u0000${row.order_id}`;
      if (existingKeys.has(key)) {
        skipped++;
      } else {
        inserted++;
      }
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

/**
 * Best 30-day EPC per product, aggregated across the product's affiliate
 * networks (max = the best-performing link). Used only to tie-break ranking
 * (see lib/ranking/epc-tie-break.ts); the values never reach the browser.
 *
 * RLS-safe by design: `product_epc_stats` has no anon SELECT policy, so under
 * the public anon client this returns an empty map and ranking degrades to pure
 * score order. Privileged callers (tenant-scoped `authenticated` admin, or the
 * service-role cron) receive real data. A query error is swallowed for the same
 * reason — a non-essential ranking signal must never break a public page.
 *
 * @returns Map of product_id → best `epc_30d`. Products with no stats are absent.
 */
export async function getEpcByProductIds(
  siteId: string,
  productIds: string[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (productIds.length === 0) return out;

  // Cap the IN list to keep the query bounded (page sizes are far below this).
  const ids = productIds.slice(0, 200);
  const sb = await getClient();
  const { data, error } = await sb
    .from(EPC_TABLE)
    .select("product_id, epc_30d")
    .eq("site_id", siteId)
    .in("product_id", ids);

  if (error || !data) return out;

  for (const row of data as { product_id: string; epc_30d: number | null }[]) {
    const epc = typeof row.epc_30d === "number" ? row.epc_30d : 0;
    if (epc > (out.get(row.product_id) ?? 0)) {
      out.set(row.product_id, epc);
    }
  }
  return out;
}

/**
 * B-F3 / P1: Real CJ (and any other network) commission revenue per day.
 * Returns a map of ISO date (`YYYY-MM-DD`) -> summed commission_amount for
 * approved/paid commissions in the requested window.
 *
 * `event_date` is the network-reported transaction date, not the ingestion date,
 * so the chart aligns with when the sale actually happened.
 */
export async function getDailyCommissionsRevenue(
  siteId: string,
  days: number,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Map<string, number>> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().split("T")[0]!;

  const sb = await getClient();
  const { data, error } = await sb
    .from(COMMISSION_TABLE)
    .select("event_date, commission_amount")
    .eq("site_id", siteId)
    .gte("event_date", sinceDate)
    .in("status", ["approved", "paid"]);

  if (error) throw error;

  const rows = assertRows<{ event_date: string | null; commission_amount: number | null }>(
    data ?? [],
  );
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const date = row.event_date;
    const amount = typeof row.commission_amount === "number" ? row.commission_amount : 0;
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    byDate.set(date, parseFloat(((byDate.get(date) ?? 0) + amount).toFixed(2)));
  }
  return byDate;
}
