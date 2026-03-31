import { getServiceClient } from "@/lib/supabase-server";
import type { AdPlacementRow, AdPlacementType } from "@/types/database";

// ad_placements is not in the generated Supabase types yet (migration pending),
// so we cast the client for insert/update calls.
const TABLE = "ad_placements";

/** List all ad placements for a site */
export async function listAdPlacements(siteId: string): Promise<AdPlacementRow[]> {
  const sb = getServiceClient();
  // eslint-disable-next-line
  const { data, error } = await (sb as any)
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("priority", { ascending: true });

  if (error) throw error;
  return data as AdPlacementRow[];
}

/** List active ad placements for a site, optionally filtered by placement type */
export async function listActiveAdPlacements(
  siteId: string,
  placementType?: AdPlacementType,
): Promise<AdPlacementRow[]> {
  const sb = getServiceClient();
  // eslint-disable-next-line
  let query = (sb as any)
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (placementType) {
    query = query.eq("placement_type", placementType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as AdPlacementRow[];
}

/** Get a single ad placement by id */
export async function getAdPlacementById(
  siteId: string,
  id: string,
): Promise<AdPlacementRow | null> {
  const sb = getServiceClient();
  // eslint-disable-next-line
  const { data, error } = await (sb as any)
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as unknown as AdPlacementRow) ?? null;
}

/** Create an ad placement */
export async function createAdPlacement(
  input: Omit<AdPlacementRow, "id" | "created_at">,
): Promise<AdPlacementRow> {
  const sb = getServiceClient();
  // eslint-disable-next-line
  const { data, error } = await (sb as any).from(TABLE).insert(input).select().single();
  if (error) throw error;
  return data as AdPlacementRow;
}

/** Update an ad placement */
export async function updateAdPlacement(
  siteId: string,
  id: string,
  input: Partial<Omit<AdPlacementRow, "id" | "site_id" | "created_at">>,
): Promise<AdPlacementRow> {
  const sb = getServiceClient();
  // eslint-disable-next-line
  const { data, error } = await (sb as any)
    .from(TABLE)
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as AdPlacementRow;
}

/** Delete an ad placement */
export async function deleteAdPlacement(
  siteId: string,
  id: string,
): Promise<void> {
  const sb = getServiceClient();
  // eslint-disable-next-line
  const { error } = await (sb as any)
    .from(TABLE)
    .delete()
    .eq("site_id", siteId)
    .eq("id", id);

  if (error) throw error;
}
