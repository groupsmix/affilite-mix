import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, type VerifyCronAuthOptions } from "@/lib/cron-auth";
import { getTenantClient } from "@/lib/supabase-server";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { untypedFrom } from "@/lib/dal/type-guards";

const cronAuthOptions: VerifyCronAuthOptions = {
  secretEnvVars: ["CRON_SECRET"],
};

/**
 * GET /api/cron/access-review
 * SOC 2 CC6.1 — Automated access recertification.
 *
 * Runs weekly (or on-demand) to:
 * 1. Enumerate all admin_users across all sites.
 * 2. Flag accounts that haven't logged in for 90+ days.
 * 3. Flag accounts with elevated roles (super_admin) for manual review.
 * 4. Write results to the access_review_log table for audit trail.
 *
 * The audit trail answers: "Who had access, and when was it last reviewed?"
 */

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request, cronAuthOptions)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = await getTenantClient();
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: adminUsers, error: fetchError } = await untypedFrom(sb, "admin_users")
      .select("id, email, role, site_id, last_sign_in_at, created_at")
      .order("site_id");

    if (fetchError) {
      captureException(fetchError, { context: "[cron/access-review] fetch admin_users" });
      return NextResponse.json({ error: "Failed to fetch admin users" }, { status: 500 });
    }

    const findings: Array<{
      user_id: string;
      email: string;
      site_id: string;
      role: string;
      flag: string;
      detail: string;
    }> = [];

    for (const user of adminUsers ?? []) {
      if (!user.last_sign_in_at || user.last_sign_in_at < ninetyDaysAgo) {
        findings.push({
          user_id: user.id,
          email: user.email,
          site_id: user.site_id,
          role: user.role,
          flag: "inactive_90d",
          detail: `Last login: ${user.last_sign_in_at ?? "never"}`,
        });
      }

      if (user.role === "super_admin") {
        findings.push({
          user_id: user.id,
          email: user.email,
          site_id: user.site_id,
          role: user.role,
          flag: "elevated_role",
          detail: "super_admin role requires periodic review",
        });
      }
    }

    const reviewEntry = {
      reviewed_at: now.toISOString(),
      total_users: (adminUsers ?? []).length,
      findings_count: findings.length,
      findings: JSON.stringify(findings),
      reviewer: "automated-cron",
    };

    const { error: insertError } = await untypedFrom(sb, "access_review_log").insert(reviewEntry);

    if (insertError) {
      logger.warn("[cron/access-review] Failed to write review log", {
        error: insertError.message,
      });
    }

    logger.info("[cron/access-review] completed", {
      totalUsers: (adminUsers ?? []).length,
      findings: findings.length,
    });

    return NextResponse.json({
      ok: true,
      totalUsers: (adminUsers ?? []).length,
      findings: findings.length,
      flaggedUsers: findings.map((f) => ({
        email: f.email,
        site_id: f.site_id,
        flag: f.flag,
        detail: f.detail,
      })),
    });
  } catch (err) {
    captureException(err, { context: "[cron/access-review] unexpected error" });
    return NextResponse.json({ error: "Access review failed" }, { status: 500 });
  }
}
