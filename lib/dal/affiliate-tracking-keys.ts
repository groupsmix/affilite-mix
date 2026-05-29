import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "affiliate_tracking_keys";

/** Resolve a DB site_id from a network-specific tracking key. Returns null if unregistered.
 *
 * F-API-01: This lookup is how we *discover* the site_id from an opaque
 * affiliate-network key — there is no site_id to filter on yet. The cron
 * caller uses the privileged client, so the Proxy requires an explicit
 * `.unsafeNoSiteFilter()` opt-out here.
 */
export async function resolveSiteByTrackingKey(
  network: string,
  trackingKey: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<string | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("site_id")
    .unsafeNoSiteFilter()
    .eq("network", network)
    .eq("tracking_key", trackingKey)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as { site_id: string } | null)?.site_id ?? null;
}
