import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

export interface AffiliateNetworkRow {
  id: string;
  site_id: string;
  network: string;
  publisher_id: string;
  api_key_ref: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const TABLE = "affiliate_networks";

/** List affiliate networks for a site */
export async function listAffiliateNetworks(siteId: string): Promise<AffiliateNetworkRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return assertRows<AffiliateNetworkRow>(data);
}

/** Get a single affiliate network config by id */
export async function getAffiliateNetworkById(
  siteId: string,
  id: string,
): Promise<AffiliateNetworkRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AffiliateNetworkRow>(data);
}

/** Create or update an affiliate network config */
export async function upsertAffiliateNetwork(
  input: Omit<AffiliateNetworkRow, "id" | "created_at" | "updated_at">,
): Promise<AffiliateNetworkRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .upsert(input as never, { onConflict: "site_id,network" })
    .select()
    .single();

  if (error) throw error;
  return assertRow<AffiliateNetworkRow>(data, "AffiliateNetwork");
}

/** Delete an affiliate network config */
export async function deleteAffiliateNetwork(siteId: string, id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}
