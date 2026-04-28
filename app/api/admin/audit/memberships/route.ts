import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listAdminUsers, type AdminUserRow } from "@/lib/dal/admin-users";
import { listAllAdminSiteMembershipsWithSlugs } from "@/lib/dal/admin-site-memberships";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";

/** F-007: Rate limit for audit endpoints (10 requests per minute) */
const AUDIT_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

/**
 * GET /api/admin/audit/memberships
 *
 * F-007: Admin membership audit report.
 *
 * Lists all admin users with their site access for access review.
 * Super admins see all admins; regular admins see only themselves.
 *
 * Response includes:
 * - All admin users with their role and active status
 * - Site memberships for each admin
 * - Flag indicating broad access (membership to all sites)
 */
export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit audit requests
  const rlKey = `audit-memberships:${session.userId ?? "unknown"}`;
  const rl = await checkRateLimit(rlKey, AUDIT_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  try {
    // Fetch all admin users
    const allAdmins = await listAdminUsers();

    // Fetch all memberships with site slugs
    const allMemberships = await listAllAdminSiteMembershipsWithSlugs();

    // Get unique site count for "broad access" detection
    const uniqueSiteIds = new Set(allMemberships.map((m) => m.site_id));
    const totalSiteCount = uniqueSiteIds.size;

    // Build audit report
    const auditRows = allAdmins.map((admin) => {
      const adminMemberships = allMemberships.filter((m) => m.admin_user_id === admin.id);
      const siteSlugs = adminMemberships.map((m) => m.site_slug);

      // F-007: Flag users with broad access (membership to all sites)
      const hasAllSitesAccess = admin.role === "super_admin" || siteSlugs.length >= totalSiteCount;

      // F-007: Flag inactive admins with active memberships
      const inactiveWithAccess = !admin.is_active && siteSlugs.length > 0;

      return {
        admin_id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        is_active: admin.is_active,
        created_at: admin.created_at,
        updated_at: admin.updated_at,
        totp_enabled: admin.totp_enabled,
        site_access: {
          count: siteSlugs.length,
          sites: siteSlugs,
        },
        flags: {
          has_all_sites_access: hasAllSitesAccess,
          inactive_with_access: inactiveWithAccess,
          is_super_admin: admin.role === "super_admin",
        },
      };
    });

    // Summary statistics
    const summary = {
      total_admins: allAdmins.length,
      active_admins: allAdmins.filter((a) => a.is_active).length,
      super_admins: allAdmins.filter((a) => a.role === "super_admin").length,
      admins_with_all_site_access: auditRows.filter((r) => r.flags.has_all_sites_access).length,
      inactive_admins_with_access: auditRows.filter((r) => r.flags.inactive_with_access).length,
      total_site_memberships: allMemberships.length,
    };

    // Recommendations for access review
    const recommendations: string[] = [];
    if (summary.inactive_admins_with_access > 0) {
      recommendations.push(
        `Revoke site access for ${summary.inactive_admins_with_access} inactive admin(s)`,
      );
    }
    if (summary.admins_with_all_site_access > 3) {
      recommendations.push(
        `Review ${summary.admins_with_all_site_access} admins with broad access - consider principle of least privilege`,
      );
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      generated_by: session.email ?? session.userId,
      summary,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      admins: auditRows,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/audit/memberships] GET failed:" });
    return NextResponse.json({ error: "Failed to generate audit report" }, { status: 500 });
  }
}
