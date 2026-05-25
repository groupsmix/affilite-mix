import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { SignJWT } from "jose";
import { headers, cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { getSiteRowBySlugWithClient } from "@/lib/dal/sites";
import { computeHmac, timingSafeEqual } from "@/lib/internal-hmac";

// A7-005: HMAC signing/verification for the x-site-id fallback header.
// Derives a signing key from SUPABASE_JWT_SECRET so no new secret is required.
const SITE_ID_SIGN_VERSION = "v1";

/** A7-005: Sign the site-id fallback header value for middleware to set. */
export async function signSiteIdFallback(siteId: string): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const sig = await computeHmac(secret, "site-id-fallback", SITE_ID_SIGN_VERSION, siteId);
    return sig;
  } catch {
    return null;
  }
}

/** A7-005: Verify the HMAC signature on the x-site-id fallback header. */
async function verifySiteIdSignature(siteId: string, signature: string | null): Promise<boolean> {
  // If no signature is present, reject the fallback in production.
  if (!signature) {
    return process.env.NODE_ENV !== "production";
  }
  const expected = await signSiteIdFallback(siteId);
  if (!expected) return process.env.NODE_ENV !== "production";
  return timingSafeEqual(signature, expected);
}

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
// F-022: Cache clients per-isolate to reduce CPU overhead.
// These clients do not hold mutable state (persistSession: false).
let _anonClient: SupabaseClient<Database> | null = null;

/**
 * @deprecated Service-role access has moved to the approved server-only
 * gateway at `lib/server-only/service-role.ts`. Import
 * `getPrivilegedSupabaseClient` from there directly. This thin wrapper is
 * kept only so existing tests and a small number of legacy call sites keep
 * working; an ESLint `no-restricted-imports` rule prevents new code from
 * importing it. New code that genuinely needs to bypass RLS must use the
 * gateway.
 */
export function getServiceClient(): SupabaseClient<Database> {
  // AUDIT-FIX: Emit a runtime warning in production so operators can
  // track legacy call sites that haven't migrated to the approved gateway.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "getServiceClient() is deprecated — use getPrivilegedSupabaseClient() from lib/server-only/service-role.ts",
        metric: "deprecated_service_client_usage",
      }),
    );
  }
  return getPrivilegedSupabaseClient();
}

const ACTIVE_SITE_COOKIE = "nh_active_site";

export async function getTenantClient(): Promise<SupabaseClient<Database>> {
  let siteId: string | null = null;

  // A-017: In admin contexts, resolve site_id from the session cookie rather
  // than the x-site-id header (which can be spoofed by a compromised client).
  // P1-9: Verify server-side membership before honoring nh_active_site.
  let userId: string | null = null;
  try {
    const session = await getAdminSession();
    if (session?.userId) {
      userId = session.userId;
      const cookieStore = await cookies();
      const activeSlug = cookieStore.get(ACTIVE_SITE_COOKIE)?.value ?? null;
      if (activeSlug) {
        // Use a privileged client to resolve the slug → UUID so we don't
        // recurse through getTenantClient().
        const priv = getPrivilegedSupabaseClient();
        const dbSite = await getSiteRowBySlugWithClient(activeSlug, async () => priv);
        if (dbSite) {
          // P1-9: Verify the admin user actually has membership on this site.
          // super_admin users bypass the membership check (they have access to all sites).
          if (session.role === "super_admin") {
            siteId = dbSite.id;
          } else {
            const { data: membership } = await priv
              .from("admin_site_memberships")
              .select("id")
              .eq("admin_user_id", session.userId)
              .eq("site_id", dbSite.id)
              .single();
            if (membership) {
              siteId = dbSite.id;
            }
            // If no membership, siteId stays null — falls back to x-site-id header
          }
        }
      }
    }
  } catch {
    // If not in a request context where cookies work, ignore
  }

  // Public pages (no admin session): fall back to the header injected by middleware.
  // A7-005: Verify the x-site-id header is HMAC-signed by middleware to prevent
  // tenant fixation via a spoofed x-site-id header (when no active-site cookie exists).
  if (!siteId) {
    const h = await headers();
    const rawSiteId = h.get("x-site-id");
    const siteIdSig = h.get("x-site-id-sig");
    if (rawSiteId && (await verifySiteIdSignature(rawSiteId, siteIdSig))) {
      siteId = rawSiteId;
    }
  }

  return getAuthenticatedClient(siteId, userId, "authenticated");
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
export function getAnonClient(): SupabaseClient<Database> {
  if (_anonClient) return _anonClient;

  const url = getSupabaseUrl();
  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  _anonClient = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (input, init) => {
        try {
          const res = await fetchWithTimeout(input as string, {
            ...init,
            timeoutMs: 8000,
            next: {
              revalidate: 60,
              ...(init as any)?.next,
            },
          });
          return res;
        } catch (error) {
          console.error("[getAnonClient] DB fetch failed (timeout or network):", error);
          return new Response(JSON.stringify({ error: "Service Unavailable", data: null }), {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        }
      },
    },
  });
  return _anonClient;
}

/* ------------------------------------------------------------------ */
/*  G-32: JWT token cache removed                                      */
/*                                                                     */
/*  Previously this module memoised the per-user JWT for 30 s (A-008)  */
/*  to avoid re-signing on every request. The cache key was            */
/*  (role, siteId, userId) — it carried no notion of the user's        */
/*  current role/permission state, so a user demoted in the DB (e.g.   */
/*  super_admin → admin, or admin → deactivated) kept their elevated   */
/*  token for up to 30 s after the change. RLS evaluates the JWT, so   */
/*  during that window the demoted user could still write through      */
/*  policies that should already deny them.                            */
/*                                                                     */
/*  Mitigation: drop the cache and mint a fresh JWT per call.          */
/*  HS256 signing with `jose` is sub-millisecond — the perf cost is    */
/*  negligible compared with the round-trip to PostgREST that follows. */
/*  If we ever need to reintroduce caching, the cache key MUST include */
/*  an `auth_version` token bumped on every role / is_active change so */
/*  invalidation happens synchronously with the privilege change       */
/*  rather than waiting for the TTL to expire.                         */
/* ------------------------------------------------------------------ */

async function mintSupabaseJwt(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

// `getAuthenticatedClient` was introduced in this branch to mint a custom
// JWT signed with SUPABASE_JWT_SECRET so RLS could evaluate a scoped user
// context instead of always bypassing via service_role.
export async function getAuthenticatedClient(
  siteId?: string | null,
  userId?: string | null,
  role = "authenticated",
): Promise<SupabaseClient<Database>> {
  const url = getSupabaseUrl();
  const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const secret = requireEnvInProduction("SUPABASE_JWT_SECRET");

  const appMetadata: Record<string, unknown> = {};
  if (siteId) appMetadata.site_id = siteId;

  const payload: Record<string, unknown> = { role, app_metadata: appMetadata };
  if (userId) payload.sub = userId;

  const token = await mintSupabaseJwt(secret, payload);

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      fetch: async (input, init) => {
        return fetchWithTimeout(input as string, {
          ...init,
          timeoutMs: 12000,
        });
      },
    },
  });
}
