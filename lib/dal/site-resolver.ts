import { getAnonClient } from "@/lib/supabase-server";

/**
 * Resolves a site slug (e.g. "crypto-tools") to its database UUID.
 * Caches results in-memory with a 5-minute TTL.
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { id: string; expiresAt: number }>();

export async function resolveDbSiteId(slug: string): Promise<string> {
  const cached = cache.get(slug);
  if (cached && Date.now() < cached.expiresAt) return cached.id;

  const sb = getAnonClient();
  const { data, error } = await sb
    .from("sites")
    .select("id")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    throw new Error(`Site not found in database for slug: ${slug}`);
  }

  const row = data as unknown as { id: string };
  cache.set(slug, { id: row.id, expiresAt: Date.now() + CACHE_TTL_MS });
  return row.id;
}
