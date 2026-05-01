import { NextRequest, NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { getTenantClient } from "@/lib/supabase-server";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { unauthorizedResponse } from "@/lib/admin-guard";
import crypto from "crypto";

/**
 * GDPR DSAR routes
 *
 * OF-01: Erasure is now atomic — wrapped in apply_gdpr_erasure RPC which
 *        deletes/anonymises all tables in a single transaction.
 * OF-02: Restriction right — PATCH adds processing_restricted_at timestamp.
 * OF-03: All GDPR actions insert an immutable row into audit_log, not just
 *        logger.info().
 */

function hashEmail(email: string): string {
  const secret = process.env.GDPR_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "GDPR_HASH_SECRET or JWT_SECRET must be set",
    );
  }
  return crypto
    .createHmac("sha256", secret)
    .update(email.toLowerCase().trim())
    .digest("hex")
    .substring(0, 16);
}

async function insertAuditLog(
  sb: Awaited<ReturnType<typeof getTenantClient>>,
  action: string,
  actor: string,
  target_email_hash: string,
  site_id: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  // OF-03: immutable audit_log insert (not just logger.info)
  await (sb.from as any)("audit_log").insert({
    action,
    actor,
    target_email_hash,
    site_id,
    metadata,
    created_at: new Date().toISOString(),
  });
}

export const GET = withAuthz("privacy", "read", async (request, { session }) => {
  if (session.role !== "super_admin") return unauthorizedResponse();

  const { searchParams } = request.nextUrl;
  const email = searchParams.get("email");
  const site_id = searchParams.get("site_id");

  if (!email || !site_id) return apiError(400, "email and site_id are required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError(400, "Invalid email format");

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
      // eslint-disable-next-line no-restricted-syntax -- admin route gated by withAuthz
      sb.from("newsletter_subscribers").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      // eslint-disable-next-line no-restricted-syntax -- admin route gated by withAuthz
      sb.from("memberships").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      // eslint-disable-next-line no-restricted-syntax -- admin route gated by withAuthz
      sb.from("comments").select("*").eq("site_id", site_id).eq("user_email", lowerEmail),
      // eslint-disable-next-line no-restricted-syntax -- admin route gated by withAuthz
      sb.from("wrist_shots").select("*").eq("site_id", site_id).eq("user_email", lowerEmail),
      // eslint-disable-next-line no-restricted-syntax -- admin route gated by withAuthz
      sb.from("quiz_submissions").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      // eslint-disable-next-line no-restricted-syntax -- admin route gated by withAuthz
      sb.from("price_alerts").select("*").eq("site_id", site_id).eq("email", lowerEmail),
      // eslint-disable-next-line no-restricted-syntax -- admin route gated by withAuthz
      sb.from("drip_enrollments").select("*").eq("email", lowerEmail),
    ]);

    await insertAuditLog(sb, "gdpr_export", session.email ?? session.userId, hashEmail(email), site_id);

    return NextResponse.json({
      ok: true,
      export: {
        user: { email: lowerEmail, site_id },
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
      },
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy] export error" });
    return apiError(500, "Failed to process data export");
  }
});

/**
 * PATCH /api/admin/privacy/user — GDPR Art. 18 Right to Restriction (OF-02)
 * Sets processing_restricted_at on all membership rows for this user.
 */
export const PATCH = withAuthz("privacy", "delete", async (request, { session }) => {
  if (session.role !== "super_admin") return unauthorizedResponse();

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id } = bodyOrError as { email?: string; site_id?: string };

  if (!email || !site_id) return apiError(400, "email and site_id are required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError(400, "Invalid email format");

  const sb = await getTenantClient();

  try {
    const { error } = await (sb.from as any)("memberships")
      .update({ processing_restricted_at: new Date().toISOString() })
      .eq("site_id", site_id)
      .eq("email", email.toLowerCase());

    if (error) {
      captureException(error, { context: "[api/admin/privacy] restriction failed" });
      return apiError(500, "Failed to apply processing restriction");
    }

    await insertAuditLog(sb, "gdpr_restrict", session.email ?? session.userId, hashEmail(email), site_id);

    return NextResponse.json({ ok: true, message: "Processing restriction applied" });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy] restriction error" });
    return apiError(500, "Failed to apply processing restriction");
  }
});

/**
 * DELETE /api/admin/privacy/user — GDPR Art. 17 Right to Erasure (OF-01, OF-03)
 * Uses apply_gdpr_erasure RPC for atomic single-transaction erasure.
 */
export const DELETE = withAuthz("privacy", "delete", async (request, { session }) => {
  if (session.role !== "super_admin") return unauthorizedResponse();

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id } = bodyOrError as { email?: string; site_id?: string };

  if (!email || !site_id) return apiError(400, "email and site_id are required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError(400, "Invalid email format");

  const sb = await getTenantClient();

  try {
    // OF-01: Single atomic RPC — all table operations happen inside one Postgres transaction.
    const { error } = await (sb.rpc as any)("apply_gdpr_erasure", {
      p_email: email.toLowerCase(),
      p_site_id: site_id,
      p_anonymized_email: `anonymized-${hashEmail(email)}@deleted.invalid`,
    });

    if (error) {
      captureException(error, { context: "[api/admin/privacy] atomic erasure failed" });
      return apiError(500, "Failed to process data erasure");
    }

    // OF-03: Immutable audit_log insert (not just logger.info)
    await insertAuditLog(sb, "gdpr_erasure", session.email ?? session.userId, hashEmail(email), site_id, {
      deleted: ["newsletter_subscribers", "comments", "wrist_shots", "quiz_submissions"],
      anonymised: ["memberships"],
      retained: ["affiliate_clicks", "audit_log"],
    });

    return NextResponse.json({
      ok: true,
      message: "User data erased successfully",
      deleted: ["newsletter_subscribers", "comments", "wrist_shots", "quiz_submissions"],
      anonymised: ["memberships"],
      retained: ["affiliate_clicks", "audit_log"],
      retention_basis: "GDPR Art. 17(3)(e) — retention for legal/financial claims",
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy] unexpected error" });
    return apiError(500, "Failed to process data erasure");
  }
});
