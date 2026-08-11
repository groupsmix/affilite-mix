import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession, AdminPayload } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getSiteRowBySlugWithClient, getSiteRowById } from "@/lib/dal/sites";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteById } from "@/config/sites";
import { getAdminSiteMembership } from "@/lib/dal/admin-site-memberships";
import { getAppCacheKV } from "@/lib/runtime-env";
import { recordAuditEvent } from "@/lib/audit-log";
import { getBearerAdminAuth, getRequestedAdminSiteSlug } from "@/lib/admin-bearer-auth";

type AdminResult =
  | { error: NextResponse; session: null; dbSiteId: null; siteSlug: null; caller: null }
  | {
      error: null;
      session: AdminPayload;
      dbSiteId: string;
      siteSlug: string;
      caller: AdminCaller;
    };

export type AdminCaller = { type: "interactive" } | { type: "machine"; tokenId: string };

/**
 * Authenticated admin navigation can fan out into several RSC/API requests per page.
 * Keep login/step-up controls strict elsewhere, but do not brick an already-authenticated
 * dashboard session when the distributed limiter binding is temporarily unavailable.
 */
const ADMIN_RATE_LIMIT = {
  maxRequests: 600,
  windowMs: 60 * 1000,
  failPolicy: "open" as const,
};

interface AdminAuth {
  session: AdminPayload;
  caller: AdminCaller;
  /** Rate-limit bucket: one per human admin, one per API token. */
  rateLimitKey: string;
  /**
   * Site the caller acts on, when it can be derived without the active-site
   * cookie (bearer clients have no cookies). Null means "use the cookie".
   */
  siteSlug: string | null;
}

/**
 * Authenticate an admin request from either the browser session cookie or an
 * `Authorization: Bearer <admin api token>` header.
 *
 * The cookie wins when both are present so an interactive session is never
 * silently escalated to a token's identity.
 */
async function authenticateAdmin(): Promise<AdminAuth | null> {
  const session = await getAdminSession();
  if (session) {
    return {
      session,
      caller: { type: "interactive" },
      rateLimitKey: `admin:${session.email ?? session.userId ?? "unknown"}`,
      siteSlug: null,
    };
  }

  const bearer = await getBearerAdminAuth();
  if (!bearer) return null;

  // Site selection for a bearer client, most to least specific: the token's
  // own tenant pin, the site it asked for, then the deployment default.
  let siteSlug: string | null = null;
  if (bearer.tokenSiteId) {
    const site = await getSiteRowById(bearer.tokenSiteId, () =>
      getPrivilegedSupabaseClient("admin-bearer-site"),
    );
    siteSlug = site?.slug ?? null;
  } else {
    siteSlug = (await getRequestedAdminSiteSlug()) ?? process.env.NEXT_PUBLIC_DEFAULT_SITE ?? null;
  }

  return {
    session: bearer.session,
    caller: { type: "machine", tokenId: bearer.tokenId },
    rateLimitKey: `admin-token:${bearer.tokenId}`,
    siteSlug,
  };
}

/**
 * G-45: Build the canonical auth error response for admin routes.
 *
 * F-21: Returns 401 for authentication failures (no session) and 403 for
 * authorization failures (wrong role/permissions). Both use the same opaque
 * `Unauthorized` body to prevent enumeration, but different status codes for
 * compliance reporting (SOC 2, PCI). Audit logs distinguish authn vs authz.
 *
 * Status codes:
 *   - 401: Not authenticated (no session)
 *   - 403: Authenticated but not authorized (wrong role/permissions)
 */
export function unauthorizedResponse(status: 401 | 403 = 401): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

/**
 * Assert that the authenticated session has the required role.
 * Returns a 403 NextResponse (with `WWW-Authenticate: Bearer`) if the role
 * is insufficient, or null if OK. F-21: 403 for authorization failures,
 * 401 for authentication failures. Same opaque body prevents enumeration.
 */
export function assertRole(
  session: AdminPayload,
  requiredRole: "admin" | "super_admin",
): NextResponse | null {
  if (requiredRole === "super_admin" && session.role !== "super_admin") {
    // F-21: Emit audit-log entry to distinguish authz failure (role insufficient)
    // from authn failure (no session). Returns 403 for compliance reporting.
    void recordAuditEvent({
      // No request-scope site context at the role-check boundary — use the
      // sentinel "_global" used by other cross-site audit emitters
      // (cf. lib/stripe-event-processor.ts).
      site_id: "_global",
      actor: session.email ?? session.userId ?? "unknown",
      actor_user_id: session.userId,
      action: "admin_role_check_failed",
      entity_type: "admin_user",
      entity_id: session.userId ?? "unknown",
      failure_type: "authz",
      details: {
        requiredRole,
        actualRole: session.role,
        userId: session.userId,
        email: session.email,
      },
    });
    return unauthorizedResponse(403);
  }
  return null;
}

/**
 * Shared admin guard for all /api/admin/* routes.
 * - Verifies the admin JWT session exists
 * - Enforces per-session rate limiting (see ADMIN_RATE_LIMIT: 600 req/min, fail-open)
 * - Accepts an `Authorization: Bearer <admin api token>` credential for
 *   non-browser clients, which have neither cookies nor a stable IP
 * - Reads the active site from the nh_active_site cookie (bearer clients use
 *   their token's site, the `x-admin-site` header, or the default site)
 * - Validates the cookie value against known site configs
 * - Resolves the database UUID for the site
 * - Verifies admin_site_memberships for non-super_admin users
 */
function isMachineDeniedPath(pathname: string): boolean {
  return [
    /^\/api\/admin\/users(?:\/|$)/,
    /^\/api\/admin\/api-tokens(?:\/|$)/,
    /^\/api\/admin\/permissions(?:\/|$)/,
    /^\/api\/admin\/sites(?:\/|$)/,
    /^\/api\/admin\/automation\/service-accounts(?:\/|$)/,
    /^\/api\/admin\/integrations(?:\/|$)/,
    /^\/api\/admin\/affiliate-networks(?:\/|$)/,
    /^\/api\/admin\/privacy(?:\/|$)/,
  ].some((pattern) => pattern.test(pathname));
}

async function denyMachineAccess(
  request: NextRequest,
  caller: AdminCaller,
  session: AdminPayload,
  siteId: string,
): Promise<NextResponse | null> {
  if (caller.type !== "machine" || !isMachineDeniedPath(request.nextUrl.pathname)) return null;
  await recordAuditEvent({
    site_id: siteId,
    actor: session.email ?? session.userId ?? "machine",
    actor_user_id: session.userId,
    action: "admin.machine_access_denied",
    entity_type: "admin_route",
    entity_id: request.nextUrl.pathname,
    details: {
      path: request.nextUrl.pathname,
      token_id: caller.tokenId,
      reason: "machine_caller_not_permitted",
    },
    failure_type: "authz",
  });
  return NextResponse.json(
    {
      error: "Machine callers are not permitted on this admin route",
      code: "ADMIN_MACHINE_ACCESS_DENIED",
    },
    { status: 403 },
  );
}

export async function requireAdmin(request?: NextRequest): Promise<AdminResult> {
  // F-21: This function now logs authn failures (no session) vs authz failures (wrong role)
  const auth = await authenticateAdmin();
  if (!auth) {
    return {
      error: unauthorizedResponse(),
      session: null,
      dbSiteId: null,
      siteSlug: null,
      caller: null,
    };
  }

  const { session } = auth;

  // Rate-limit by admin identity (email or userId), or by token id
  const rl = await checkRateLimit(auth.rateLimitKey, ADMIN_RATE_LIMIT);
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
      caller: null,
    };
  }

  // Read the active site from the cookie, unless the credential already
  // determined it (bearer tokens send no cookies).
  const siteSlug = auth.siteSlug ?? (await getActiveSiteSlug());
  if (!siteSlug) {
    return {
      error: NextResponse.json({ error: "No site selected" }, { status: 400 }),
      session: null,
      dbSiteId: null,
      siteSlug: null,
      caller: null,
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
      caller: null,
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
    // fail-open: best-effort [criticality:non-critical]
    // KV cache miss — falls through to DB lookup
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
        // fail-open: best-effort [criticality:non-critical]
        // KV cache write failure — no impact on auth decision
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
        caller: null,
      };
    }
    // LIB-2: resolveDbSiteId() can throw ("Site not found in database") when a
    // known static-config site fails to auto-provision (DB write error, unique
    // conflict that the single re-read did not resolve, etc.). Previously that
    // throw propagated uncaught → 500. Catch it here and treat as an
    // unresolvable site so the request is denied cleanly instead of erroring.
    // Also guards against a hypothetical null return — a null dbSiteId must
    // never reach getAdminSiteMembership(), which would otherwise receive
    // `undefined` and bypass the membership check.
    try {
      dbSiteId = await resolveDbSiteId(siteSlug);
    } catch {
      dbSiteId = null;
    }
    if (!dbSiteId) {
      return {
        error: unauthorizedResponse(),
        session: null,
        dbSiteId: null,
        siteSlug: null,
        caller: null,
      };
    }
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
        caller: null,
      };
    }
  }

  // Enforce token scope: a session minted from a site-scoped API token carries
  // a `site_id` claim and may only act on that one site — even for a
  // super_admin. A manually changed active-site cookie that resolves to a
  // different tenant is rejected. Sessions without the claim (interactive
  // logins, all-sites tokens) are unaffected.
  if (session.site_id && session.site_id !== dbSiteId) {
    return {
      error: unauthorizedResponse(),
      session: null,
      dbSiteId: null,
      siteSlug: null,
      caller: null,
    };
  }

  if (request && auth.caller.type === "machine" && isMachineDeniedPath(request.nextUrl.pathname)) {
    const denial = await denyMachineAccess(request, auth.caller, session, dbSiteId);
    if (!denial) return { error: null, session, dbSiteId, siteSlug, caller: auth.caller };
    return {
      error: denial,
      session: null,
      dbSiteId: null,
      siteSlug: null,
      caller: null,
    };
  }

  return { error: null, session, dbSiteId, siteSlug, caller: auth.caller };
}

/**
 * Lightweight admin guard that verifies authentication and applies rate
 * limiting but does NOT require an active site cookie.
 *
 * Use this for endpoints that must work before a site is selected (e.g.
 * listing available sites, selecting a site, checking active site). All
 * other admin routes should continue using requireAdmin() for full site-
 * context validation.
 *
 * audit5-#12: the name `requireAdminSession` is intentionally similar to
 * `requireAdmin` because both verify the admin JWT, but only THIS
 * function is safe to use *before* a site is selected. A future rename
 * to `requireAdminSessionBeforeSiteSelect` is tracked in the private
 * audit/deferred-findings ledger; do NOT collapse this helper into
 * `requireAdmin` even if it looks redundant. The eslint
 * `no-restricted-imports` rule below pins the legal call sites so an
 * over-zealous refactor cannot silently expand its surface area.
 *
 * **Call sites whitelist** (keep in sync with the ESLint rule):
 *   - app/api/admin/sites/active/route.ts
 *   - app/api/admin/sites/route.ts (list-all branch)
 *   - app/api/admin/sites/select/route.ts
 *   - app/api/admin/sites/stats/route.ts
 *
 * Anywhere else is a misuse — use `requireAdmin()` (which also enforces
 * the active-site cookie) or `withAuthz`.
 */
export async function requireAdminSession(
  request?: NextRequest,
): Promise<{ error: NextResponse; session: null } | { error: null; session: AdminPayload }> {
  const auth = await authenticateAdmin();
  if (!auth) {
    return { error: unauthorizedResponse(), session: null };
  }

  const { session } = auth;
  const rl = await checkRateLimit(auth.rateLimitKey, ADMIN_RATE_LIMIT);
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

  if (request && auth.caller.type === "machine" && isMachineDeniedPath(request.nextUrl.pathname)) {
    const denial = await denyMachineAccess(request, auth.caller, session, "_global");
    if (denial) return { error: denial, session: null };
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
    return { error: forbidden, session: null, dbSiteId: null, siteSlug: null, caller: null };
  }
  return okResult;
}
