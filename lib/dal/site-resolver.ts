import { getServiceClient } from "@/lib/supabase-server";

/**
 * Resolves a site slug (e.g. "crypto-tools") to its database UUID.
 * Caches results in-memory for the lifetime of the process.
 */
const cache = new Map<string, string>();

export async function resolveDbSiteId(slug: string): Promise<string> {
  const cached = cache.get(slug);
  if (cached) return cached;

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("sites")
    .select("id")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    throw new Error(`Site not found in database for slug: ${slug}`);
  }

  const row = data as unknown as { id: string };
  cache.set(slug, row.id);
  return row.id;
}
