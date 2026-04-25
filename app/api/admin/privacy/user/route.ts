import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getTenantClient } from "@/lib/supabase-server";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

/**
 * DELETE /api/admin/privacy/user — GDPR Right to be Forgotten (RTBF)
 * F-021: Deletes user data across all related tables
 *
 * This endpoint:
 * 1. Requires super-admin authentication
 * 2. Accepts email + site_id to identify the user
 * 3. Deletes/anonymizes data from: newsletter_subscribers, memberships,
 *    comments, wrist_shots, quiz_submissions
 * 4. Retains affiliate_clicks + audit_log for legal/financial compliance
 *    (anonymizes IP addresses instead of deleting)
 *
 * GDPR Art. 17: Right to Erasure
 * NOTE: This is a simplified implementation. For full compliance,
 * consider a background job / queue for large deletions.
 */

export async function GET(request: NextRequest) {
  const { error: authError, session } = await requireAdmin();
  if (authError) return authError;

  if (session.role !== "super_admin") {
    return apiError(403, "Only super admins can perform data exports");
  }

  const { searchParams } = request.nextUrl;
  const email = searchParams.get("email");
  const site_id = searchParams.get("site_id");

  if (!email || !site_id) {
    return apiError(400, "email and site_id are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return apiError(400, "Invalid email format");
  }

  const sb = await getTenantClient();
  const lowerEmail = email.toLowerCase();

  try {
    const [
      { data: newsletters },
      { data: memberships },
      { data: comments },
      { data: wristShots },
      { data: quizzes },
      { data: priceAlerts },
      { data: dripEnrollments },
    ] = await Promise.all([
      sb.from("newsletter_subscribers").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      sb.from("memberships").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      sb.from("comments").select("*").eq("site_id", site_id).eq("user_email", lowerEmail),
      sb.from("wrist_shots").select("*").eq("site_id", site_id).eq("user_email", lowerEmail),
      sb.from("quiz_submissions").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      sb.from("price_alerts").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      sb.from("drip_enrollments").select("*").eq("email", lowerEmail),
    ]);

    const exportPayload = {
      user: {
        email: lowerEmail,
        site_id,
      },
      generated_at: new Date().toISOString(),
      data: {
        newsletter_subscribers: newsletters || [],
        memberships: memberships || [],
        comments: comments || [],
        wrist_shots: wristShots || [],
        quiz_submissions: quizzes || [],
        price_alerts: priceAlerts || [],
        drip_enrollments: dripEnrollments || [],
      },
    };

    logger.info("GDPR data export performed", {
      actor: session.email ?? session.userId,
      action: "gdpr_export",
      target_email_hash: hashEmail(email),
      site_id,
    });

    return NextResponse.json({
      ok: true,
      export: exportPayload,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy] unexpected error during export" });
    return apiError(500, "Failed to process data export");
  }
}

export async function DELETE(request: NextRequest) {
  const { error: authError, session } = await requireAdmin();
  if (authError) return authError;

  // F-021: Only super_admin can perform data erasure (security-critical operation)
  if (session.role !== "super_admin") {
    return apiError(403, "Only super admins can perform data erasure");
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id } = bodyOrError as { email?: string; site_id?: string };

  if (!email || !site_id) {
    return apiError(400, "email and site_id are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return apiError(400, "Invalid email format");
  }

  const sb = await getTenantClient();
  const results: Record<string, unknown> = { email_hash: hashEmail(email) };

  try {
    // 1. Delete newsletter subscriptions
    const { error: newsletterErr } = await sb
      .from("newsletter_subscribers")
      .delete()
      .eq("site_id", site_id)
      .eq("email", email.toLowerCase());

    if (newsletterErr) {
      captureException(newsletterErr, { context: "[api/admin/privacy] newsletter delete failed" });
    }
    results.newsletter_deleted = !newsletterErr;

    // 2. Anonymize memberships (financial records - retained for legal compliance)
    // `email` is NOT NULL in the schema, so replace with a non-reversible hashed alias
    // and null out optional PII fields. Stripe IDs are retained for reconciliation.
    // Cast via `sb.from as typeof sb.from` loses the tuple of known table literals,
    // matching the pattern used in lib/dal/memberships.ts for tables not yet in the
    // generated types file.
    const anonymizedEmail = `anonymized-${hashEmail(email)}@deleted.invalid`;
    const { error: membershipErr } = await (sb.from as any)("memberships")
      .update({
        email: anonymizedEmail,
        name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("site_id", site_id)
      .eq("email", email.toLowerCase());

    if (membershipErr) {
      captureException(membershipErr, {
        context: "[api/admin/privacy] membership anonymize failed",
      });
    }
    results.memberships_anonymized = !membershipErr;

    // 3. Delete comments
    const { error: commentsErr } = await sb
      .from("comments")
      .delete()
      .eq("site_id", site_id)
      .eq("user_email", email.toLowerCase());

    if (commentsErr) {
      captureException(commentsErr, { context: "[api/admin/privacy] comments delete failed" });
    }
    results.comments_deleted = !commentsErr;

    // 4. Delete wrist shots
    const { error: wristShotErr } = await sb
      .from("wrist_shots")
      .delete()
      .eq("site_id", site_id)
      .eq("user_email", email.toLowerCase());

    if (wristShotErr) {
      captureException(wristShotErr, { context: "[api/admin/privacy] wrist_shots delete failed" });
    }
    results.wrist_shots_deleted = !wristShotErr;

    // 5. Delete quiz submissions
    const { error: quizErr } = await sb
      .from("quiz_submissions")
      .delete()
      .eq("site_id", site_id)
      .eq("email", email.toLowerCase());

    if (quizErr) {
      captureException(quizErr, { context: "[api/admin/privacy] quiz_submissions delete failed" });
    }
    results.quiz_submissions_deleted = !quizErr;

    // 6. affiliate_clicks is retained for financial/legal compliance.
    // The current schema stores no direct PII (no email or IP columns) so no
    // anonymisation action is required here; record the intent in the result.
    results.affiliate_clicks_retained = true;

    // 7. Audit log: record this erasure event (audit_log itself is retained for compliance)
    logger.info("GDPR data erasure performed", {
      actor: session.email ?? session.userId,
      action: "gdpr_erasure",
      target_email_hash: hashEmail(email),
      site_id,
    });

    return NextResponse.json({
      ok: true,
      message: "User data erased successfully",
      results,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy] unexpected error" });
    return apiError(500, "Failed to process data erasure");
  }
}

import crypto from "crypto";

/**
 * HMAC-SHA256 hash for GDPR audit logging.
 * Replaces the weak 32-bit rolling hash to prevent dictionary attacks
 * on exported/erased user emails while still allowing correlation.
 */
function hashEmail(email: string): string {
  const secret = process.env.GDPR_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "GDPR_HASH_SECRET or JWT_SECRET must be set — refusing to hash with a hardcoded fallback",
    );
  }
  return crypto
    .createHmac("sha256", secret)
    .update(email.toLowerCase().trim())
    .digest("hex")
    .substring(0, 16);
}
