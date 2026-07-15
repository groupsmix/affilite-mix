import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "affiliate_tracking_keys";
const LOOKUP_BATCH_SIZE = 500;

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
    // SAFE: this lookup discovers tenant identity from a global network key before site_id is known.
    .unsafeNoSiteFilter()
    .eq("network", network)
    .eq("tracking_key", trackingKey)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as { site_id: string } | null)?.site_id ?? null;
}

/** Resolve multiple network tracking keys without issuing one query per report. */
export async function resolveSitesByTrackingKeys(
  network: string,
  trackingKeys: string[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Map<string, string>> {
  const uniqueKeys = Array.from(new Set(trackingKeys.filter((key) => key.trim() !== "")));
  const resolved = new Map<string, string>();
  if (uniqueKeys.length === 0) return resolved;

  const sb = await getClient();
  for (let start = 0; start < uniqueKeys.length; start += LOOKUP_BATCH_SIZE) {
    const batch = uniqueKeys.slice(start, start + LOOKUP_BATCH_SIZE);
    const { data, error } = await sb
      .from(TABLE)
      .select("tracking_key, site_id")
      // SAFE: this lookup discovers tenant identity from global network keys before site_id is known.
      .unsafeNoSiteFilter()
      .eq("network", network)
      .in("tracking_key", batch);

    if (error) throw error;

    for (const row of (data ?? []) as { tracking_key: string; site_id: string }[]) {
      if (typeof row.tracking_key === "string" && typeof row.site_id === "string") {
        resolved.set(row.tracking_key, row.site_id);
      }
    }
  }

  return resolved;
}
