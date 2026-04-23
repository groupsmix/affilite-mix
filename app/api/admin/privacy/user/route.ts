import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getServiceClient } from "@/lib/supabase-server";
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

  const sb = getServiceClient();
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

/** Simple hash for logging (not reversible) */
function hashEmail(email: string): string {
  let hash = 0;
  const str = email.toLowerCase();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
