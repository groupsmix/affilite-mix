import { assertRows, assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

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
const LIST_COLUMNS =
  "id, site_id, network, publisher_id, api_key_ref, is_active, config, created_at, updated_at" as const;

/** List affiliate networks for a site */
export async function listAffiliateNetworks(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AffiliateNetworkRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return assertRows<AffiliateNetworkRow>(data);
}

/** Create or update an affiliate network config */
export async function upsertAffiliateNetwork(
  input: Omit<AffiliateNetworkRow, "id" | "created_at" | "updated_at">,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AffiliateNetworkRow> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .upsert(input as never, { onConflict: "site_id,network" })
    .select()
    .single();

  if (error) throw error;
  return assertRow<AffiliateNetworkRow>(data, "AffiliateNetwork");
}

/** Delete an affiliate network config */
export async function deleteAffiliateNetwork(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}
