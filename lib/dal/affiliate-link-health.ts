import type { AffiliateLinkHealthRow } from "@/types/database";
import { getPrivilegedDalClient, type DalClientGetter } from "./dal-client";
import { assertRows, assertRow, rowOrNull, untypedFrom } from "./type-guards";

const TABLE = "affiliate_link_health";
const HEALTH_COLUMNS =
  "id, site_id, product_id, product_affiliate_link_id, url, network, last_probed_at, last_http_status, final_url, baseline_registrable_domain, latency_ms, consecutive_failures, failure_streak_started_at, classification, created_at, updated_at" as const;

export type LinkHealthClassification = "healthy" | "broken" | "suspicious";

export interface AffiliateLinkHealthListRow extends AffiliateLinkHealthRow {
  product_name: string;
  product_slug: string;
}

export interface LinkHealthProbeUpdate {
  site_id: string;
  product_id: string;
  product_affiliate_link_id?: string | null;
  url: string;
  network: string;
  last_probed_at: string;
  last_http_status?: number | null;
  final_url?: string | null;
  baseline_registrable_domain?: string | null;
  latency_ms?: number | null;
  consecutive_failures: number;
  failure_streak_started_at?: string | null;
  classification: LinkHealthClassification;
}

const privilegedHealthClient: DalClientGetter = getPrivilegedDalClient;

export async function getAffiliateLinkHealthCursor(
  getClient: DalClientGetter = privilegedHealthClient,
): Promise<string | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, "cron_state")
    .select("cursor")
    .eq("job_name", "affiliate-link-health")
    .maybeSingle();
  if (error) throw error;
  const cursor = (data as { cursor?: unknown } | null)?.cursor;
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
  const targetKey = (cursor as Record<string, unknown>).target_key;
  return typeof targetKey === "string" ? targetKey : null;
}

export async function setAffiliateLinkHealthCursor(
  targetKey: string | null,
  getClient: DalClientGetter = privilegedHealthClient,
): Promise<void> {
  const sb = await getClient();
  const { error } = await untypedFrom(sb, "cron_state").upsert(
    {
      job_name: "affiliate-link-health",
      cursor: { target_key: targetKey },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "job_name" },
  );
  if (error) throw error;
}

export async function upsertAffiliateLinkHealth(
  update: LinkHealthProbeUpdate,
  getClient: DalClientGetter = privilegedHealthClient,
): Promise<AffiliateLinkHealthRow> {
  const sb = await getClient();
  let existingQuery = untypedFrom(sb, TABLE)
    .select("id")
    .eq("site_id", update.site_id)
    .eq("product_id", update.product_id)
    .eq("url", update.url);
  existingQuery =
    update.product_affiliate_link_id == null
      ? existingQuery.is("product_affiliate_link_id", null)
      : existingQuery.eq("product_affiliate_link_id", update.product_affiliate_link_id);
  const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
  if (lookupError) throw lookupError;
  const values = {
    ...update,
    product_affiliate_link_id: update.product_affiliate_link_id ?? null,
    last_http_status: update.last_http_status ?? null,
    final_url: update.final_url ?? null,
    baseline_registrable_domain: update.baseline_registrable_domain ?? null,
    latency_ms: update.latency_ms ?? null,
    failure_streak_started_at: update.failure_streak_started_at ?? null,
    updated_at: update.last_probed_at,
  };
  const { data, error } = existing
    ? await untypedFrom(sb, TABLE)
        .update(values)
        .eq("id", (existing as { id: string }).id)
        .select(HEALTH_COLUMNS)
        .single()
    : await untypedFrom(sb, TABLE).insert(values).select(HEALTH_COLUMNS).single();
  if (error) throw error;
  return assertRow<AffiliateLinkHealthRow>(data, TABLE);
}

export async function getAffiliateLinkHealth(
  siteId: string,
  productId: string,
  url: string,
  productAffiliateLinkId: string | null,
  getClient: DalClientGetter = privilegedHealthClient,
): Promise<AffiliateLinkHealthRow | null> {
  const sb = await getClient();
  let query = untypedFrom(sb, TABLE)
    .select(HEALTH_COLUMNS)
    .eq("site_id", siteId)
    .eq("product_id", productId)
    .eq("url", url);
  query =
    productAffiliateLinkId === null
      ? query.is("product_affiliate_link_id", null)
      : query.eq("product_affiliate_link_id", productAffiliateLinkId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return rowOrNull<AffiliateLinkHealthRow>(data);
}

export async function listUnhealthyAffiliateLinks(
  siteId: string,
  options: { limit?: number; offset?: number } = {},
  getClient: DalClientGetter = privilegedHealthClient,
): Promise<AffiliateLinkHealthListRow[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const offset = Math.max(0, Math.min(options.offset ?? 0, 100_000));
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(HEALTH_COLUMNS)
    .eq("site_id", siteId)
    .in("classification", ["broken", "suspicious"])
    .order("classification", { ascending: false })
    .order("consecutive_failures", { ascending: false })
    .order("last_probed_at", { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = assertRows<AffiliateLinkHealthRow>(data);
  if (rows.length === 0) return [];
  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const { data: products, error: productError } = await sb
    .from("products")
    .select("id, name, slug")
    .eq("site_id", siteId)
    .in("id", productIds);
  if (productError) throw productError;
  const productById = new Map(
    ((products ?? []) as Array<{ id: string; name: string; slug: string }>).map((product) => [
      product.id,
      product,
    ]),
  );
  return rows.map((row) => ({
    ...row,
    product_name: productById.get(row.product_id)?.name ?? "Unknown product",
    product_slug: productById.get(row.product_id)?.slug ?? "",
  }));
}
