import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";

/**
 * Service client for tables not yet in the generated Supabase types.
 * Returns a client without Database generics so `.from("table").insert(...)`
 * doesn't resolve to `never`. Prefer `getServiceClient()` for typed tables.
 */
export function getUntypedServiceClient() {
  // eslint-disable-next-line
  return createClient(supabaseUrl, serviceRoleKey) as any;
}

const supabaseUrl = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL", "");
const serviceRoleKey = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY", "");
const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");  

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
  return createClient<Database>(supabaseUrl, serviceRoleKey);
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
export function getAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey);
}
