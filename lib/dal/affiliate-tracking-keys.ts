import { getTenantClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

export interface AffiliateTrackingKeyRow {
  site_id: string;
  network: string;
  tracking_key: string;
  created_at: string;
  updated_at: string;
}

const TABLE = "affiliate_tracking_keys";

/** Resolve a DB site_id from a network-specific tracking key. Returns null if unregistered. */
export async function resolveSiteByTrackingKey(
  network: string,
  trackingKey: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<string | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("site_id")
    .eq("network", network)
    .eq("tracking_key", trackingKey)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as { site_id: string } | null)?.site_id ?? null;
}

/** List all tracking keys for a site (admin UI) */
export async function listTrackingKeysBySite(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AffiliateTrackingKeyRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("network", { ascending: true });

  if (error) throw error;
  return assertRows<AffiliateTrackingKeyRow>(data ?? []);
}

/** Upsert a tracking key mapping (admin UI) */
export async function upsertTrackingKey(
  siteId: string,
  network: string,
  trackingKey: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AffiliateTrackingKeyRow> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .upsert(
      { site_id: siteId, network, tracking_key: trackingKey },
      { onConflict: "network,tracking_key" },
    )
    .select()
    .single();

  if (error) throw error;
  return assertRow<AffiliateTrackingKeyRow>(data, "AffiliateTrackingKey");
}

/** Delete a tracking key mapping (admin UI) */
export async function deleteTrackingKey(
  network: string,
  trackingKey: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("network", network)
    .eq("tracking_key", trackingKey);

  if (error) throw error;
}
