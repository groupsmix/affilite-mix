import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";

const supabaseUrl = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL", "");
const serviceRoleKey = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY", "");

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in server-side code (API routes, Server Actions, DAL).
 * Cached as a singleton to reuse connection pooling and auth caching.
 */
let cachedClient: SupabaseClient<Database> | null = null;

export function getServiceClient() {
  if (!cachedClient) {
    cachedClient = createClient<Database>(supabaseUrl, serviceRoleKey);
  }
  return cachedClient;
}
