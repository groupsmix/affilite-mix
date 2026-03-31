import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";

// Re-export a minimal untyped client for tables not yet in the generated types.
// This avoids scattering `(sb as any)` across DAL files.
type UntypedClient = ReturnType<typeof createClient>;

/** Get a service client without schema type constraints (for tables not in generated types). */
export function getUntypedServiceClient(): UntypedClient {
  return createClient(supabaseUrl, serviceRoleKey);
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
