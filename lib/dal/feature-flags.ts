/**
 * Data Access Layer — Site Feature Flags
 *
 * Per-site feature flags with kill-switch capability.
 * Flags can be toggled without code deploy.
 */

import { getServiceClient } from "@/lib/supabase-server";
import type { SiteFeatureFlagRow } from "@/types/database";
import { assertRows, assertRow } from "./type-guards";

const TABLE = "site_feature_flags";

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

/** List all feature flags for a site */
export async function listSiteFeatureFlags(siteId: string): Promise<SiteFeatureFlagRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("flag_key", { ascending: true });

  if (error) throw error;
  return assertRows<SiteFeatureFlagRow>(data);
}

/** Check if a specific feature flag is enabled for a site */
export async function isFeatureFlagEnabled(siteId: string, flagKey: string): Promise<boolean> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("is_enabled")
    .eq("site_id", siteId)
    .eq("flag_key", flagKey)
    .single();

  if (error && error.code === "PGRST116") return false;
  if (error) throw error;
  return (data as { is_enabled: boolean } | null)?.is_enabled ?? false;
}

/** Get all enabled flag keys for a site (fast lookup) */
export async function getEnabledFlagKeys(siteId: string): Promise<string[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("flag_key")
    .eq("site_id", siteId)
    .eq("is_enabled", true);

  if (error) throw error;
  return (data as { flag_key: string }[] | null)?.map((d) => d.flag_key) ?? [];
}

/* ------------------------------------------------------------------ */
/*  Write operations                                                   */
/* ------------------------------------------------------------------ */

/** Upsert a feature flag for a site */
export async function upsertFeatureFlag(input: {
  site_id: string;
  flag_key: string;
  is_enabled: boolean;
  description?: string;
}): Promise<SiteFeatureFlagRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .upsert(
      {
        site_id: input.site_id,
        flag_key: input.flag_key,
        is_enabled: input.is_enabled,
        description: input.description ?? "",
      },
      { onConflict: "site_id,flag_key" },
    )
    .select()
    .single();

  if (error) throw error;
  return assertRow<SiteFeatureFlagRow>(data, "SiteFeatureFlag");
}

/** Bulk-upsert feature flags for a site */
export async function bulkUpsertFeatureFlags(
  siteId: string,
  flags: { flag_key: string; is_enabled: boolean; description?: string }[],
): Promise<SiteFeatureFlagRow[]> {
  if (flags.length === 0) return [];

  const sb = getServiceClient();
  const rows = flags.map((f) => ({
    site_id: siteId,
    flag_key: f.flag_key,
    is_enabled: f.is_enabled,
    description: f.description ?? "",
  }));

  const { data, error } = await sb
    .from(TABLE)
    .upsert(rows, { onConflict: "site_id,flag_key" })
    .select();

  if (error) throw error;
  return assertRows<SiteFeatureFlagRow>(data);
}

/** Delete a feature flag */
export async function deleteFeatureFlag(siteId: string, flagKey: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("flag_key", flagKey);

  if (error) throw error;
}
