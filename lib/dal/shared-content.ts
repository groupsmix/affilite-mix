import { getServiceClient } from "@/lib/supabase-server";
import { assertRow, assertRows } from "./type-guards";

const TABLE = "shared_content";
const LIST_COLUMNS = "id, content_id, source_site_id, target_site_id, created_at" as const;

interface SharedContentRow {
  id: string;
  content_id: string;
  source_site_id: string;
  target_site_id: string;
  created_at: string;
}

/** Share content from one site to another */
export async function shareContent(
  contentId: string,
  sourceSiteId: string,
  targetSiteId: string,
): Promise<SharedContentRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      content_id: contentId,
      source_site_id: sourceSiteId,
      target_site_id: targetSiteId,
    })
    .select()
    .single();

  if (error) throw error;
  return assertRow<SharedContentRow>(data, "SharedContent");
}

/** Remove a cross-niche share */
export async function unshareContent(contentId: string, targetSiteId: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("content_id", contentId)
    .eq("target_site_id", targetSiteId);

  if (error) throw error;
}

/** List all sites a piece of content is shared to */
export async function listSharedTargets(contentId: string): Promise<SharedContentRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("content_id", contentId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<SharedContentRow>(data ?? []);
}

/** List content shared TO a given site (from other sites) */
export async function listContentSharedToSite(targetSiteId: string): Promise<SharedContentRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("target_site_id", targetSiteId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<SharedContentRow>(data ?? []);
}
