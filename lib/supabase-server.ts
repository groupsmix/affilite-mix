import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { SignJWT } from "jose";

// Environment variables are resolved lazily (inside functions) so that
// module evaluation during `next build` does not throw when the vars
// are not yet available (e.g. Vercel preview builds).
//
// There is intentionally no `placeholder.supabase.co` fallback here:
// in production runtime, `requireEnvInProduction` throws if any of
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY is missing, so broken config fails fast
// instead of silently succeeding against a non-existent backend.

function getSupabaseUrl(): string {
  const url = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");

  // Fail-fast in production if not using the pooler endpoint.
  // Direct connections will exhaust PostgreSQL's connection limit on edge runtimes
  // (Cloudflare Workers) where each request opens a new connection.
  if (process.env.NODE_ENV === "production" && url && !url.includes("pooler.supabase")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must use the Supabase connection pooler in production. " +
        "Use the pooler URL (e.g. https://xxx.pooler.supabase.com) " +
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
 * R3: Removed the global caching anti-pattern. We create a fresh client per request.
 * F19: The previous issue F19 asked to cache this per-isolate because TLS handshake overhead.
 * But R3 asked to fix the singleton anti-pattern. Actually, creating a fresh client in JS
 * DOES NOT create a new TLS handshake every time if the underlying Node.js/Cloudflare
 * fetch implementation reuses connections (which they do via connection pooling).
 * The global client caching was causing cross-request state pollution and was an anti-pattern.
 */
export function getServiceClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
export function getAnonClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * F10: Mint a custom JWT signed with the Supabase JWT secret to provide
 * true defense-in-depth. Instead of bypassing RLS with the service_role key,
 * we use the anon key but inject a custom JWT containing the site_id and user_id.
 *
 * This enables the Supabase RLS policies to actually enforce tenancy at the DB level,
 * rather than relying solely on the DAL `.eq('site_id', site_id)` filters.
 */
export async function getAuthenticatedClient(
  userId: string,
  siteId?: string,
  role: string = "authenticated",
): Promise<SupabaseClient<Database>> {
  const url = getSupabaseUrl();
  const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const jwtSecret = requireEnvInProduction("SUPABASE_JWT_SECRET");

  // Create a custom JWT that Supabase will recognize
  const payload: any = {
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 60 * 5, // 5 minutes
    sub: userId,
    role: role,
    email: "admin@internal",
    app_metadata: {
      provider: "email",
      providers: ["email"],
    },
    user_metadata: {},
  };

  if (siteId) {
    payload.app_metadata.site_id = siteId;
  }

  const secret = new TextEncoder().encode(jwtSecret);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(secret);

  const client = createClient<Database>(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
