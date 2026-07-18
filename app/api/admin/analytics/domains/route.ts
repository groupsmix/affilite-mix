import { NextRequest, NextResponse } from "next/server";
import { getDomainPerformance } from "@/lib/dal/analytics-dashboard";
import { captureException } from "@/lib/sentry";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
// B-F2: getDomainPerformance iterates the full tenant registry and counts clicks
// per site — it is a cross-tenant rollup that requires the privileged client (the
// default RLS-bound tenant client only sees the active site, so every other site's
// click count was 0). The route is already gated on requireSuperAdmin() and is on
// the SERVICE_ROLE_IMPORT_ALLOWLIST (lib/security/service-role-allowlist.ts).
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import

/**
 * GET /api/admin/analytics/domains — Performance by domain/site (super_admin only).
 *
 * F3: getDomainPerformance() returns a registry-wide breakdown across EVERY site
 * (see lib/dal/analytics-dashboard.ts — the "(super-admin)" cross-site aggregate;
 * it calls listSites() and sums clicks/revenue per site). The previous
 * withAuthz("analytics", "view") guard is *site-scoped*: it only asserts the
 * caller has analytics:view for their own active site, a permission held even by
 * the read-only Analyst role. That exposed every tenant's domains, click counts
 * and estimated revenue to any single-tenant analytics viewer.
 *
 * Cross-tenant aggregate data must be gated on super_admin, matching the DAL's
 * stated intent. Per-site analytics remain available through the site-scoped
 * sibling routes (summary / revenue / products / conversion), which correctly
 * pass the guard-derived siteId into their DAL calls.
 *
 * Query params:
 *   ?days=7  — lookback window (default 7, max 365)
 */
export async function GET(request: NextRequest) {
  const { error, session } = await requireSuperAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rlResponse = await enforceAdminRateLimit("analytics:domains", session);
  if (rlResponse) return rlResponse;

  try {
    const days = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("days") ?? "7"), 1),
      365,
    );

    const since = new Date();
    since.setDate(since.getDate() - days);

    const domains = await getDomainPerformance(
      since.toISOString(),
      // B-F2: thread the privileged client so listSites() + getClickCount()
      // bypass RLS and return real data for every tenant, not just the active one.
      getPrivilegedSupabaseClient,
    );

    return NextResponse.json({ days, domains });
  } catch (err) {
    captureException(err, { context: "[api/admin/analytics/domains] GET failed:" });
    return NextResponse.json({ error: "Failed to load domain analytics" }, { status: 500 });
  }
}
