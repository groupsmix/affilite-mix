import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, unauthorizedResponse } from "@/lib/admin-guard";
import { getSiteById } from "@/config/sites";
import { getSiteRowBySlugWithClient } from "@/lib/dal/sites";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getAdminSiteMembership } from "@/lib/dal/admin-site-memberships";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { recordAuditEvent } from "@/lib/audit-log";

/** POST /api/admin/sites/select — set the active site cookie */
export async function POST(request: NextRequest) {
  // Use requireAdminSession() (no site context) — this endpoint must work
  // before a site is selected (requireAdmin() demands a site cookie).
  const { error, session } = await requireAdminSession(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rlError = await enforceAdminRateLimit("sites-select", session);
  if (rlError) return rlError;

  // A session minted from a site-scoped API token is pinned to one tenant and
  // must not be able to switch sites, even if it is a super_admin session.
  if (session.site_id) {
    return NextResponse.json(
      { error: "This token is scoped to a single site and cannot switch sites." },
      { status: 403 },
    );
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { siteId } = bodyOrError as { siteId?: string };

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  // Resolve the target from static config OR the DB registry. Sites created
  // via the admin panel are DB-only and absent from getSiteById(), so fall
  // back to the sites table using the privileged client (the tenant client
  // mints HS256 JWTs that fail on asymmetric Supabase signing keys). Without
  // this fallback, selecting a DB-only site 404s and the active-site cookie
  // is never set, so every dashboard tab bounces back to /sites.
  const staticSite = getSiteById(siteId);
  let activeSlug: string | null = null;
  let activeName: string | null = null;

  if (staticSite) {
    activeSlug = staticSite.id;
    activeName = staticSite.name;
  } else {
    const dbSite = await getSiteRowBySlugWithClient(siteId, () =>
      getPrivilegedSupabaseClient("admin-sites-select"),
    );
    if (dbSite) {
      activeSlug = dbSite.slug;
      activeName = dbSite.name;
    }
  }

  if (!activeSlug) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Enforce membership: non-super_admin users must have a membership row
  // for the target site. super_admin can still switch globally.
  // G-45: standardised 401 + Bearer challenge instead of 403 so a probe
  // cannot enumerate which sites the caller is or isn't a member of.
  if (session.role !== "super_admin" && session.userId) {
    let dbSiteId: string;
    try {
      dbSiteId = await resolveDbSiteId(activeSlug);
    } catch {
      // Site not yet provisioned in DB (e.g. DB unavailable or config site
      // that has never been selected by a super_admin). Return a clear error
      // rather than crashing the route with an unhandled rejection — the
      // client's finally block will show a toast instead of going silent.
      return NextResponse.json(
        { error: "Site is not available. A super admin must activate it first." },
        { status: 503 },
      );
    }
    // admin_site_memberships table requires service_role (RLS restricted)
    const privilegedGetter = () => getPrivilegedSupabaseClient("admin-sites-select");
    let membership;
    try {
      membership = await getAdminSiteMembership(session.userId, dbSiteId, privilegedGetter);
    } catch {
      return NextResponse.json(
        { error: "Could not verify site access. Please try again." },
        { status: 503 },
      );
    }
    if (!membership) {
      return unauthorizedResponse();
    }
  }

  const response = NextResponse.json({ ok: true, site: { id: activeSlug, name: activeName } });

  // FIX-34 (F-017): Audit log for site context switch
  void recordAuditEvent({
    site_id: activeSlug,
    actor: session.email ?? session.userId ?? "admin",
    action: "select_site",
    entity_type: "site",
    entity_id: activeSlug,
    details: { siteName: activeName },
  });

  response.cookies.set(ACTIVE_SITE_COOKIE, activeSlug, {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}
