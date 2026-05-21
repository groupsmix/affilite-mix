import { requireEnvInProduction } from "@/lib/env";

export interface MiddlewareSiteRow {
  id?: string;
  slug?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

/**
 * Edge-safe site lookup for middleware.
 *
 * Middleware runs in Next's Edge runtime, so it must not import the normal DAL:
 * that path pulls in `next/headers`, auth helpers, bcrypt, and other Node/server
 * modules. Query Supabase REST directly with the anon key instead; public RLS
 * already allows reads of active site rows only.
 */
export async function getMiddlewareSiteRowByDomain(
  domain: string,
): Promise<MiddlewareSiteRow | null> {
  const supabaseUrl = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) return null;

  const endpoint = new URL(
    "/rest/v1/sites",
    supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`,
  );
  endpoint.searchParams.set("select", "id,slug,is_active");
  endpoint.searchParams.set("domain", `eq.${domain}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Supabase site lookup failed with status ${response.status}`);
  }

  const rows = (await response.json()) as MiddlewareSiteRow[];
  return rows[0] ?? null;
}
