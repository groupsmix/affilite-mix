import { createClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";

const supabaseUrl = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL", "");
const serviceRoleKey = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY", "");

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in server-side code (API routes, Server Actions, DAL).
 * Cached as a singleton to reuse connection pooling and auth caching.
 */
let cachedClient: ReturnType<typeof createClient> | null = null;

export function getServiceClient() {
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey);
  }
  return cachedClient;
}
