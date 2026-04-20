import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";

// Environment variables are resolved lazily (inside functions) so that
// module evaluation during `next build` does not throw when the vars
// are not yet available (e.g. Vercel preview builds).
//
// There is intentionally no `placeholder.supabase.co` fallback here:
// in production runtime, `requireEnvInProduction` throws if any of
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY is missing, so broken config fails fast
// instead of silently succeeding against a non-existent backend.

let poolerWarningEmitted = false;

function getSupabaseUrl(): string {
  const url = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");

  // Warn in production if the Supabase URL is not using the pooler endpoint.
  // Direct connections will exhaust PostgreSQL's connection limit on edge runtimes
  // (Cloudflare Workers) where each request opens a new connection.
  if (
    !poolerWarningEmitted &&
    process.env.NODE_ENV === "production" &&
    url &&
    !url.includes("pooler.supabase")
  ) {
    poolerWarningEmitted = true;
    console.warn(
      "NEXT_PUBLIC_SUPABASE_URL does not appear to use the Supabase connection pooler. " +
        "In production on edge runtimes, use the pooler URL (e.g. https://xxx.pooler.supabase.com) " +
        "to avoid exhausting PostgreSQL connection limits.",
    );
  }

  return url;
}

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in server-side code (API routes, Server Actions, DAL)
 * for admin operations that genuinely need to bypass RLS.
 *
 * Note: On Cloudflare Workers / @opennextjs/cloudflare, module-level singletons
 * may persist across requests within the same isolate or be lost between isolates.
 * The Supabase JS client is lightweight, so we create a fresh client per request
 * to avoid stale connections or memory leaks in edge runtimes.
 */
export function getServiceClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, key);
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
export function getAnonClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient<Database>(url, key);
}

/**
 * Tenant-scoped anon client.  Sends the `x-tenant-id` HTTP header with
 * every request so PostgREST exposes it as
 * `current_setting('request.header.x-tenant-id', true)`.
 *
 * RLS policies (migration 00035) call `tenant_site_id()` which reads
 * this header.  Without it the policies return zero rows (fail-closed).
 *
 * Use this instead of bare `getAnonClient()` in every public-facing DAL
 * function that reads tenant data (products, content, pages, categories,
 * content_products, sites).
 */
export function getTenantAnonClient(siteId: string): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient<Database>(url, key, {
    global: {
      headers: { "x-tenant-id": siteId },
    },
    auth: { persistSession: false },
  });
}
