import { createHash } from "crypto";
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

  // Upsert one at a time to keep per-row resilience while deduplicating on the
  // full (network, order_id) unique index (migration 2026062003).
  for (const report of reports) {
    // Bug 6: some networks omit order_id. Those rows were excluded from the old
    // PARTIAL dedup index (WHERE order_id IS NOT NULL) and duplicated on every
    // run. Derive a deterministic key so re-ingesting the same sale dedups.
    const order_id = report.order_id ?? syntheticOrderId(report);
    const row = { ...report, order_id };

    // Classify new vs. already-present for accurate accounting. `skipped` is
    // retained (the cron route consumes { inserted, skipped }) but now means
    // "already present → refreshed in place" rather than "dropped".
    const { data: existing } = await sb
      .from(COMMISSION_TABLE)
      .select("id")
      // F11 + F12: scope the existence check to the reporting tenant. This both
      // satisfies the F-API-01 privileged-client guard (this SELECT previously
      // threw at the await boundary, killing ingest) and stops Site A's row from
      // masking Site B's identical (network, order_id).
      .eq("site_id", row.site_id)
      .eq("network", row.network)
      .eq("order_id", order_id)
      .maybeSingle();

    // Bug 6: upsert (was insert-only) so a re-reported sale updates its status
    // and amounts instead of erroring on 23505 and being silently skipped. The
    // onConflict target matches the tenant-scoped unique index from migration
    // 2026062004 (site_id, network, order_id).
    const { error } = await sb
      .from(COMMISSION_TABLE)
      .upsert(row, { onConflict: "site_id,network,order_id" })
      .select("id")
      .single();

    if (error) throw error;

    if (existing) {
      skipped++;
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
