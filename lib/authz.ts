// Authorization helpers for /api/admin/* routes.
//
// Three patterns are exposed:
//
//   1. `withAuthz(feature, action, handler)` — wrap a route handler in a
//      permission check scoped to the **server-derived** active site
//      (the `nh_active_site` cookie validated by `requireAdmin`). The
//      site identifier is never read from query params or the request
//      body, so a caller cannot widen access by appending
//      `?site_id=<another>`.
//
//   2. `withAuthzDynamic(feature, action, handler)` — same as withAuthz
//      but preserves Next 15's `(request, { params })` signature for
//      dynamic routes (e.g. `app/api/admin/foo/[id]/route.ts`). The
//      resolved params are passed as `context.params`.
//
//   3. `authorizeResource({ session, feature, action, resourceType,
//      resourceId })` — fetch the row by its primary key, read its real
//      `site_id`, then check permission against that derived id. This is
//      the right primitive for routes that mutate a single resource by
//      `[id]`: it makes "ID belongs to a different tenant" a 404 instead
//      of a successful cross-tenant write.
//
// The intent is to remove the bad pattern below from every route:
//
//     const siteId = request.nextUrl.searchParams.get("site_id");
//     await checkPermission(user, siteId, action);   // attacker-controlled
//
// and replace it with derivations the user cannot forge.

import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession, type AdminPayload } from "./auth";
import { hasPermission } from "./dal/permissions";
import type { PermissionFeature, PermissionAction } from "@/types/database";
import { apiError } from "./api-error";
import { requireAdmin } from "./admin-guard";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { getCircuitBreaker } from "@/lib/ai/circuit-breaker";
import { untypedFrom } from "@/lib/dal/type-guards";

export type AuthenticatedRouteHandler = (
  request: NextRequest,
  context: {
    session: AdminPayload;
    /** Server-derived active site id (from the validated cookie). */
    siteId: string;
    /** Server-derived active site slug (from the validated cookie). */
    siteSlug: string;
    /** AbortSignal for timeout propagation (F-11) */
    signal?: AbortSignal;
  },
) => Promise<NextResponse> | NextResponse;

export type AuthenticatedDynamicRouteHandler = (
  request: NextRequest,
  context: {
    session: AdminPayload;
    /** Server-derived active site id (from the validated cookie). */
    siteId: string;
    /** Server-derived active site slug (from the validated cookie). */
    siteSlug: string;
    /** Resolved dynamic route params (e.g. `{ id: "abc" }`). */
    params: Record<string, string>;
    /** AbortSignal for timeout propagation (F-11) */
    signal?: AbortSignal;
  },
) => Promise<NextResponse> | NextResponse;

/**
 * Evaluate `hasPermission` with fail-closed error handling.
 *
 * A thrown error from `hasPermission` means the permission *check itself*
 * failed — e.g. the tenant-scoped Supabase JWT (signed with
 * `SUPABASE_JWT_SECRET`) was rejected by PostgREST, or the `admin_users`
 * lookup errored — NOT that the user lacks access. Previously such throws
 * propagated uncaught out of `withAuthz` / `withAuthzDynamic`, so Next.js
 * returned an unstructured 500. Admin clients parse error bodies as JSON and
 * fall back to a generic "Failed to save" when parsing fails, hiding the real
 * cause. We now log the underlying error server-side and return a structured
 * JSON response the client can surface.
 *
 * Returns a `NextResponse` when the request must be rejected (permission
 * denied, or the check failed), or `null` when the caller may proceed.
 */
async function evaluatePermission(
  userId: string,
  siteId: string,
  feature: PermissionFeature,
  action: PermissionAction,
  signal: AbortSignal,
): Promise<NextResponse | null> {
  let allowed: boolean;
  try {
    allowed = await hasPermission(userId, siteId, feature, action, undefined, signal);
  } catch (err) {
    if (signal.aborted) {
      // eslint-disable-next-line no-console -- timeout diagnostic
      console.error("[authz] permission check aborted due to timeout", { feature, action });
      return apiError(503, "Permission check timed out. Please retry.");
    }
    // fail-closed: a check failure must never be treated as "allowed"
    // eslint-disable-next-line no-console -- security-relevant diagnostic
    console.error("[authz] permission check failed", {
      feature,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
    return apiError(
      503,
      "Permission check failed. This usually indicates a backend configuration issue.",
    );
  }
  if (!allowed) {
    return apiError(403, "Forbidden");
  }
  return null;
}

/**
 * Guard a non-dynamic route (no `[param]` segments) by feature+action
 * against the **server-derived** active site. Use this in place of any
 * handler that previously read `request.nextUrl.searchParams.get("site_id")`
 * for authorization.
 */
export function withAuthz(
  feature: PermissionFeature,
  action: PermissionAction,
  handler: AuthenticatedRouteHandler,
) {
  return async (request: NextRequest) => {
    // Keep the shared guard invocation explicit for static authz re-audits: requireAdmin()
    const auth = await (request ? requireAdmin(request) : requireAdmin());
    if (auth.error) return auth.error;
    const { session, dbSiteId, siteSlug } = auth;

    if (!session?.userId) {
      return apiError(401, "Unauthorized");
    }

    // F-11: Extract signal from request for timeout propagation
    const signal = request.signal;

    const denied = await evaluatePermission(session.userId, dbSiteId, feature, action, signal);
    if (denied) return denied;

    const res = await handler(request, {
      session,
      siteId: dbSiteId,
      siteSlug,
      signal,
    });
    return res;
  };
}

/**
 * Guard a dynamic route (with `[param]` segments) by feature+action
 * against the **server-derived** active site. Same as `withAuthz` but
 * preserves Next 15's `(request, { params })` signature so the route
 * validator accepts the export. The resolved params are passed as
 * `context.params` to the inner handler.
 *
 * Inside the handler, call `authorizeResource()` for the specific
 * resource ID to get defense-in-depth tenant isolation.
 */
export function withAuthzDynamic(
  feature: PermissionFeature,
  action: PermissionAction,
  handler: AuthenticatedDynamicRouteHandler,
) {
  return async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const auth = await (request ? requireAdmin(request) : requireAdmin());
    if (auth.error) return auth.error;
    const { session, dbSiteId, siteSlug } = auth;

    if (!session?.userId) {
      return apiError(401, "Unauthorized");
    }

    // F-11: Extract signal from request for timeout propagation
    const signal = request.signal;

    const denied = await evaluatePermission(session.userId, dbSiteId, feature, action, signal);
    if (denied) return denied;

    const resolvedParams = await params;
    return handler(request, {
      session,
      siteId: dbSiteId,
      siteSlug,
      params: resolvedParams,
      signal,
    });
  };
}

/**
 * Catalog of resource types that `authorizeResource` knows how to look
 * up. The value is the database table whose `id` / `site_id` columns
 * will be queried with the privileged client.
 *
 * Adding a new entry is a deliberate act: it pre-declares which tables
 * are addressable by client-supplied resource ids, so a route handler
 * cannot accidentally authorize against an arbitrary table.
 */
const RESOURCE_TABLES = {
  page: "pages",
  product: "products",
  ad_placement: "ad_placements",
  content: "content",
  category: "categories",
  deal: "deals",
  quiz: "quizzes",
  drip_campaign: "drip_campaigns",
  commission: "commissions",
  membership: "memberships",
  module: "site_modules",
  ai_draft: "ai_drafts",
  affiliate_network: "affiliate_networks",
  scheduled_job: "scheduled_jobs",
} as const;

type AuthorizedResourceType = keyof typeof RESOURCE_TABLES;

/** Hoisted allowlist for authorizeResource (audit P7-001). */
const VALID_RESOURCE_TYPES = Object.keys(RESOURCE_TABLES) as AuthorizedResourceType[];

function parseAuthzEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type AuthorizationFailure = {
  ok: false;
  status: 401 | 403 | 404;
  reason: string;
};

type AuthorizationSuccess = {
  ok: true;
  /** Real site_id read from the resource row (never caller-supplied). */
  siteId: string;
};

export type AuthorizationResult = AuthorizationSuccess | AuthorizationFailure;

export interface AuthorizeResourceOptions {
  session: AdminPayload | null;
  feature: PermissionFeature;
  action: PermissionAction;
  resourceType: AuthorizedResourceType;
  resourceId: string;
  /**
   * If set, requires the resource's real `site_id` to also equal this
   * value. Pass the server-derived active site id when the route is
   * scoped to one tenant — a mismatch (e.g. attacker-supplied id from a
   * different site) becomes an explicit 403 instead of a silent 404.
   */
  expectedSiteId?: string | null;
}

/**
 * Resolve a resource's real `site_id` and check `hasPermission` against
 * it. Always treats lookup failures and missing rows as not-found so
 * the caller cannot probe for the existence of cross-tenant resources.
 */
export async function authorizeResource(
  opts: AuthorizeResourceOptions,
): Promise<AuthorizationResult> {
  if (!opts.session?.userId) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }

  // SECURITY-FIX: Runtime validation that resourceType is a known key (T1-002 / CWE-89)
  // TypeScript enums are erased at runtime; an attacker can pass arbitrary strings.
  if (!VALID_RESOURCE_TYPES.includes(opts.resourceType)) {
    return { ok: false, status: 403, reason: "Unknown resource type" };
  }

  const table = RESOURCE_TABLES[opts.resourceType];
  if (!table) {
    return { ok: false, status: 403, reason: "Unknown resource type" };
  }

  if (!opts.resourceId || typeof opts.resourceId !== "string") {
    return { ok: false, status: 404, reason: "Resource not found" };
  }

  // A98/A99: Circuit breaker around privileged DB call to prevent cascade
  // failure if the Supabase primary is degraded or down.
  // F10-001: Threshold/recovery configurable for production traffic (default 10 / 30s).
  const cb = getCircuitBreaker("authorizeResource", {
    failureThreshold: parseAuthzEnvInt("AUTHZ_CIRCUIT_BREAKER_FAILURE_THRESHOLD", 10),
    recoveryTimeoutMs: parseAuthzEnvInt("AUTHZ_CIRCUIT_BREAKER_RECOVERY_MS", 30_000),
  });

  // F-11: Create AbortSignal for timeout (5s default)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const signal = controller.signal;

  let data: { site_id: string } | null = null;
  try {
    data = await cb.execute(async () => {
      const sb = getPrivilegedSupabaseClient();
      const result = await untypedFrom(sb, table)
        .select("site_id")
        // SAFE: resource ownership is resolved here; site_id is checked
        // against the expected site below. The table is accessed with the
        // privileged client which enforces an explicit site-filter opt-out.
        .unsafeNoSiteFilter()
        .eq("id", opts.resourceId)
        .abortSignal(signal)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data as { site_id: string } | null;
    });
  } catch (err) {
    clearTimeout(timeout);
    // F-11: Log if error was due to abort (timeout)
    if (signal.aborted) {
      // eslint-disable-next-line no-console -- timeout diagnostic
      console.error("[F-11] authorizeResource query aborted due to timeout", {
        resourceType: opts.resourceType,
        resourceId: opts.resourceId,
      });
    }
    // fail-closed: lookup error → deny access [criticality:security-critical]
    // Don't differentiate "row missing" from "lookup error" to the caller —
    // both must look the same so cross-tenant ids cannot be probed.
    return { ok: false, status: 404, reason: "Resource not found" };
  }
  clearTimeout(timeout);

  const realSiteId = (data as { site_id: string } | null)?.site_id;
  if (!realSiteId) {
    return { ok: false, status: 404, reason: "Resource not found" };
  }

  if (opts.expectedSiteId && opts.expectedSiteId !== realSiteId) {
    return {
      ok: false,
      status: 403,
      reason: "Forbidden: resource does not belong to the active site",
    };
  }

  const allowed = await hasPermission(
    opts.session.userId,
    realSiteId,
    opts.feature,
    opts.action,
    undefined,
    signal,
  );
  if (!allowed) {
    return { ok: false, status: 403, reason: "Forbidden" };
  }

  return { ok: true, siteId: realSiteId };
}

/** Convert an `AuthorizationFailure` into a `NextResponse`. */
export function authorizationErrorResponse(failure: AuthorizationFailure): NextResponse {
  return apiError(failure.status, failure.reason);
}

/**
 * Convenience: fetch the current admin session, then run
 * `authorizeResource` against it. Returns either a typed failure or
 * `{ ok: true, session, siteId }`.
 */
export async function authorizeResourceForCurrentSession(
  opts: Omit<AuthorizeResourceOptions, "session">,
): Promise<AuthorizationFailure | { ok: true; session: AdminPayload; siteId: string }> {
  const session = await getAdminSession();
  const result = await authorizeResource({ ...opts, session });
  if (!result.ok) return result;
  return { ok: true, session: session as AdminPayload, siteId: result.siteId };
}
