import { requireEnvInProduction } from "@/lib/env";
import { singleFlight } from "@/lib/singleflight";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { CircuitBreaker } from "@/lib/ai/circuit-breaker";

/**
 * Hard cap for the Supabase REST site-lookup. Middleware already
 * wraps the lookup in an outer `Promise.race` of 5 seconds before
 * falling back to a degraded response, but a single slow Supabase
 * round-trip would hold the isolate for the full window. Tightening
 * to 1.5 s lets a true slow path surface as a clean 503 quickly and
 * frees the isolate for the next request.
 */
const SITE_LOOKUP_TIMEOUT_MS = 1500;

/**
 * A99-2: Circuit breaker for middleware site-resolution DB calls.
 * Prevents repeated Supabase lookups when the DB is degraded.
 * Uses a low threshold (3 failures) and short recovery (10s) because
 * middleware is latency-critical.
 */
const siteLookupBreaker = new CircuitBreaker("middleware-site-lookup", {
  failureThreshold: 3,
  recoveryTimeoutMs: 10_000,
});

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
 *
 * A75-F1: Wrapped in single-flight to prevent cache stampede. When a cached
 * site row expires and multiple concurrent requests hit this function for the
 * same domain, only one DB lookup is triggered — the rest coalesce on its result.
 */
export async function getMiddlewareSiteRowByDomain(
  domain: string,
): Promise<MiddlewareSiteRow | null> {
  return singleFlight(`site-lookup:${domain}`, () => _fetchSiteRowByDomain(domain));
}

async function _fetchSiteRowByDomain(domain: string): Promise<MiddlewareSiteRow | null> {
  const supabaseUrl = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) return null;

  // A99-2: Circuit breaker wraps the DB call so repeated failures fast-fail.
  return siteLookupBreaker.execute(async () => {
    const endpoint = new URL(
      "/rest/v1/sites",
      supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`,
    );
    endpoint.searchParams.set("select", "id,slug,is_active,url_redirects");
    endpoint.searchParams.set("domain", `eq.${domain}`);
    endpoint.searchParams.set("limit", "1");

    const response = await fetchWithTimeout(endpoint.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      timeoutMs: SITE_LOOKUP_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw new Error(`Supabase site lookup failed with status ${response.status}`);
    }

    const rows = (await response.json()) as MiddlewareSiteRow[];
    return rows[0] ?? null;
  });
}
