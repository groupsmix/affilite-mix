import { NextResponse } from "next/server";
import { getAdminSession, AdminPayload } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getSiteRowBySlugWithClient } from "@/lib/dal/sites";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteById } from "@/config/sites";
import { getAdminSiteMembership } from "@/lib/dal/admin-site-memberships";
import { getAppCacheKV } from "@/lib/runtime-env";

type AdminResult =
  | { error: NextResponse; session: null; dbSiteId: null; siteSlug: null }
  | { error: null; session: AdminPayload; dbSiteId: string; siteSlug: string };

/** 100 admin API requests per minute per user session (3.30) */
const ADMIN_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60 * 1000,
  failPolicy: "grace" as const,
  graceMs: 60_000,
};

/**
 * G-45: Build the canonical 401 response for admin routes.
 *
 * Both unauthenticated and unauthorised callers receive the same opaque
 * `Unauthorized` body and `WWW-Authenticate: Bearer` challenge so an
 * unauthenticated probe cannot distinguish:
 *   - a route that does not exist                  (404)
 *   - a route that requires a different role       (was 403)
 *   - a route the caller has no membership for     (was 403)
 *   - a route the caller is simply not signed into (401)
 *
 * Using a single status + body removes the route-existence side channel.
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

/**
 * Assert that the authenticated session has the required role.
 * Returns a 401 NextResponse (with `WWW-Authenticate: Bearer`) if the role
 * is insufficient, or null if OK. See `unauthorizedResponse` for why we
 * return 401 here rather than 403.
 */
export function assertRole(
  session: AdminPayload,
  requiredRole: "admin" | "super_admin",
): NextResponse | null {
  if (requiredRole === "super_admin" && session.role !== "super_admin") {
    return unauthorizedResponse();
  }
  return null;
}

/**
 * Shared admin guard for all /api/admin/* routes.
 * - Verifies the admin JWT session exists
 * - Enforces per-session rate limiting (100 req/min)
 * - Reads the active site from the nh_active_site cookie
 * - Validates the cookie value against known site configs
 * - Resolves the database UUID for the site
 * - Verifies admin_site_memberships for non-super_admin users
 */
export async function requireAdmin(): Promise<AdminResult> {
  const session = await getAdminSession();
  if (!session) {
    return {
      error: unauthorizedResponse(),
      session: null,
      dbSiteId: null,
      siteSlug: null,
    };
  }

  // Rate-limit by admin identity (email or userId)
  const rateLimitKey = `admin:${session.email ?? session.userId ?? "unknown"}`;
  const rl = await checkRateLimit(rateLimitKey, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      ),
      session: null,
      dbSiteId: null,
      siteSlug: null,
    };
  }

  // Read the active site from the cookie
  const siteSlug = await getActiveSiteSlug();
  if (!siteSlug) {
    return {
      error: NextResponse.json({ error: "No site selected" }, { status: 400 }),
      session: null,
      dbSiteId: null,
      siteSlug: null,
    };
  }

  // SECURITY-FIX: Validate siteSlug format to prevent KV key injection (I5-004 / CWE-22)
  // Minimum 3 chars rejects degenerate slugs like "a-" (audit V4-006).
  if (
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(siteSlug) ||
    siteSlug.length < 3 ||
    siteSlug.length > 63
  ) {
    return {
      error: NextResponse.json({ error: "Invalid site" }, { status: 400 }),
      session: null,
      dbSiteId: null,
      siteSlug: null,
    };
  }

  // A-003: DB registry is authoritative. Try KV cache → DB lookup first,
  // then fall back to static config for seed/known sites.
  let dbSiteId: string | null = null;
  const kvCacheKey = `admin-guard:site-slug:${siteSlug}`;

  try {
    const kv = getAppCacheKV();
    if (kv) {
      const cached = (await kv.get(kvCacheKey, "json")) as { id?: string } | null;
      if (cached && typeof cached.id === "string") {
        dbSiteId = cached.id;
      }
    }
  } catch {
    // fail-open: best-effort
    // Ignore KV errors
  }

  if (!dbSiteId) {
    const dbSite = await getSiteRowBySlugWithClient(siteSlug, getPrivilegedSupabaseClient);
    if (dbSite) {
      dbSiteId = dbSite.id;
      try {
        const kv = getAppCacheKV();
        if (kv) {
          await kv.put(kvCacheKey, JSON.stringify({ id: dbSiteId }), { expirationTtl: 300 });
        }
      } catch {
        // fail-open: best-effort
        // Ignore KV write errors
      }
    }
  }

  if (!dbSiteId) {
    // Fall back to static config for seed/known sites
    const siteConfig = getSiteById(siteSlug);
    if (!siteConfig) {
      return {
        error: NextResponse.json({ error: "Invalid site" }, { status: 400 }),
        session: null,
        dbSiteId: null,
        siteSlug: null,
      };
    }
    dbSiteId = await resolveDbSiteId(siteSlug);
  }

  // Enforce membership: non-super_admin users must have a membership row
  // for the active site. A forged or manually changed cookie is not enough.
  // G-45: respond with a generic 401 (not 403) so route existence cannot
  // be probed by toggling the active-site cookie.
  if (session.role !== "super_admin" && session.userId) {
    const membership = await getAdminSiteMembership(session.userId, dbSiteId);
    if (!membership) {
      return {
        error: unauthorizedResponse(),
        session: null,
        dbSiteId: null,
        siteSlug: null,
      };
    }
  }

  return { error: null, session, dbSiteId, siteSlug };
}

/**
 * Lightweight admin guard that verifies authentication and applies rate
 * limiting but does NOT require an active site cookie.
 *
 * Use this for endpoints that must work before a site is selected (e.g.
 * listing available sites, selecting a site, checking active site). All
 * other admin routes should continue using requireAdmin() for full site-
 * context validation.
 */
export async function requireAdminSession(): Promise<
  { error: NextResponse; session: null } | { error: null; session: AdminPayload }
> {
  const session = await getAdminSession();
  if (!session) {
    return { error: unauthorizedResponse(), session: null };
  }

  const rateLimitKey = `admin:${session.email ?? session.userId ?? "unknown"}`;
  const rl = await checkRateLimit(rateLimitKey, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      ),
      session: null,
    };
  }

  return { error: null, session };
}

/**
 * Convenience wrapper: calls requireAdmin() then asserts super_admin role.
 * Returns the same AdminResult shape — with a 401 error (Bearer challenge)
 * if the role is insufficient. See `unauthorizedResponse` for rationale.
 */
export async function requireSuperAdmin(): Promise<AdminResult> {
  const result = await requireAdmin();
  if (result.error) return result;

  // Narrow the union: error is null, so session is AdminPayload
  const okResult = result as Extract<AdminResult, { error: null }>;
  const forbidden = assertRole(okResult.session, "super_admin");
  if (forbidden) {
    return { error: forbidden, session: null, dbSiteId: null, siteSlug: null };
  }
  return okResult;
}
