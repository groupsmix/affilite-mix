import { assertRows, rowOrNull, assertRow } from "./type-guards";
import type { AdPlacementRow, AdPlacementType } from "@/types/database";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "ad_placements";
const LIST_COLUMNS =
  "id, site_id, name, placement_type, provider, ad_code, config, is_active, priority, created_at" as const;

/** List all ad placements for a site */
export async function listAdPlacements(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdPlacementRow[]> {
  const sb = await getClient();
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
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdPlacementRow[]> {
  const sb = await getClient();
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
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdPlacementRow | null> {
  const sb = await getClient();
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
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdPlacementRow> {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<AdPlacementRow>(data, "AdPlacement");
}

/** Update an ad placement */
export async function updateAdPlacement(
  siteId: string,
  id: string,
  input: Partial<Omit<AdPlacementRow, "id" | "site_id" | "created_at">>,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdPlacementRow> {
  const sb = await getClient();
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
export async function deleteAdPlacement(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);

  if (error) throw error;
}
