import { NextResponse } from "next/server";
import { getAdminSession, AdminPayload } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { checkRateLimit } from "@/lib/rate-limit";

type AdminResult =
  | { error: NextResponse; session: null; dbSiteId: null; siteSlug: null }
  | { error: null; session: AdminPayload; dbSiteId: string; siteSlug: string };

/** 100 admin API requests per minute per user session (3.30) */
const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

/**
 * Assert that the authenticated session has the required role.
 * Returns a 403 NextResponse if the role is insufficient, or null if OK.
 */
export function assertRole(
  session: AdminPayload,
  requiredRole: "admin" | "super_admin",
): NextResponse | null {
  if (requiredRole === "super_admin" && session.role !== "super_admin") {
    return NextResponse.json(
      { error: "Forbidden: super_admin role required" },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Shared admin guard for all /api/admin/* routes.
 * - Verifies the admin JWT session exists
 * - Enforces per-session rate limiting (100 req/min)
 * - Reads the active site from the nh_active_site cookie
 * - Resolves the database UUID for the site
 */
export async function requireAdmin(): Promise<AdminResult> {
  const session = await getAdminSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
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

  const dbSiteId = await resolveDbSiteId(siteSlug);
  return { error: null, session, dbSiteId, siteSlug };
}

/**
 * Convenience wrapper: calls requireAdmin() then asserts super_admin role.
 * Returns the same AdminResult shape — with a 403 error if the role is insufficient.
 */
export async function requireSuperAdmin(): Promise<AdminResult> {
  const result = await requireAdmin();
  if (result.error) return result;

  const forbidden = assertRole(result.session, "super_admin");
  if (forbidden) {
    return { error: forbidden, session: null, dbSiteId: null, siteSlug: null };
  }
  return result;
}
