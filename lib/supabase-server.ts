import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";

const supabaseUrl = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL", "");
const serviceRoleKey = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY", "");
const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in server-side code (API routes, Server Actions, DAL)
 * for admin operations that genuinely need to bypass RLS.
 * Cached as a singleton to reuse connection pooling and auth caching.
 */
let cachedClient: SupabaseClient<Database> | null = null;

export function getServiceClient() {
  if (!cachedClient) {
    cachedClient = createClient<Database>(supabaseUrl, serviceRoleKey);
  }
  return cachedClient;
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
let cachedAnonClient: SupabaseClient<Database> | null = null;

export function getAnonClient() {
  if (!cachedAnonClient) {
    cachedAnonClient = createClient<Database>(supabaseUrl, anonKey);
  }
  return cachedAnonClient;
}
