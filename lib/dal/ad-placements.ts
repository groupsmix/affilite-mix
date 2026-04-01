import { getServiceClient, getAnonClient } from "@/lib/supabase-server";
import { assertRows, rowOrNull, assertRow } from "./type-guards";
import type { AdPlacementRow, AdPlacementType } from "@/types/database";

const TABLE = "ad_placements";
const LIST_COLUMNS =
  "id, site_id, name, placement_type, provider, ad_code, config, is_active, priority, created_at" as const;

/** List all ad placements for a site */
export async function listAdPlacements(siteId: string): Promise<AdPlacementRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .order("priority", { ascending: true });

  if (error) throw error;
  return assertRows<AdPlacementRow>(data);
}

/** List active ad placements for a site, optionally filtered by placement type */
export async function listActiveAdPlacements(
  siteId: string,
  placementType?: AdPlacementType,
): Promise<AdPlacementRow[]> {
  const sb = getAnonClient();
  let query = sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (placementType) {
    query = query.eq("placement_type", placementType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<AdPlacementRow>(data);
}

/** Get a single ad placement by id */
export async function getAdPlacementById(
  siteId: string,
  id: string,
): Promise<AdPlacementRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AdPlacementRow>(data);
}

/** Create an ad placement */
export async function createAdPlacement(
  input: Omit<AdPlacementRow, "id" | "created_at">,
): Promise<AdPlacementRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<AdPlacementRow>(data, "AdPlacement");
}

/** Update an ad placement */
export async function updateAdPlacement(
  siteId: string,
  id: string,
  input: Partial<Omit<AdPlacementRow, "id" | "site_id" | "created_at">>,
): Promise<AdPlacementRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<AdPlacementRow>(data, "AdPlacement");
}

/** Delete an ad placement */
export async function deleteAdPlacement(siteId: string, id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);

  if (error) throw error;
}
