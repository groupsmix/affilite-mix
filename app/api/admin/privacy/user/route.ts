import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { withAuthz } from "@/lib/authz";
import { getTenantClient } from "@/lib/supabase-server";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { unauthorizedResponse } from "@/lib/admin-guard";
import { untypedRpc } from "@/lib/dal/type-guards";

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

export const GET = withAuthz("privacy", "read", async (request, { session }) => {
  const rlResponse = await enforceAdminRateLimit("privacy-user", session);
  if (rlResponse) return rlResponse;

  // G-45: standardised 401 + Bearer challenge instead of a descriptive 403,
  // so route existence / role gating cannot be probed.
  if (session.role !== "super_admin") {
    return unauthorizedResponse();
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
      newslettersRes,
      membershipsRes,
      commentsRes,
      wristShotsRes,
      quizzesRes,
      priceAlertsRes,
      dripEnrollmentsRes,
    ] = await Promise.all([
      sb
        .from("newsletter_subscribers") // eslint-disable-line no-restricted-syntax -- Audited: admin GDPR export
        .select(
          "id, site_id, email, status, confirmation_token, confirmed_at, unsubscribe_token, created_at",
        )
        .eq("site_id", site_id)
        .eq("email", lowerEmail),
      sb
        .from("memberships") // eslint-disable-line no-restricted-syntax -- Audited: admin GDPR export
        .select(
          "id, site_id, email, name, tier, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancelled_at, created_at, updated_at",
        )
        .eq("site_id", site_id)
        .eq("email", lowerEmail),
      sb
        .from("comments") // eslint-disable-line no-restricted-syntax -- Audited: admin GDPR export
        .select(
          "id, site_id, target_type, target_id, parent_id, user_email, user_name, body, status, approved_at, created_at, updated_at",
        )
        .eq("site_id", site_id)
        .eq("user_email", lowerEmail),
      sb
        .from("wrist_shots") // eslint-disable-line no-restricted-syntax -- Audited: admin GDPR export
        .select(
          "id, site_id, product_id, user_email, user_name, image_url, caption, status, approved_at, created_at, updated_at",
        )
        .eq("site_id", site_id)
        .eq("user_email", lowerEmail),
      sb
        .from("quiz_submissions") // eslint-disable-line no-restricted-syntax -- Audited: admin GDPR export
        .select(
          "id, site_id, quiz_id, session_id, email, answers, result_tags, status, completed_at, created_at, updated_at",
        )
        .eq("site_id", site_id)
        .eq("email", lowerEmail),
      sb
        .from("price_alerts") // eslint-disable-line no-restricted-syntax -- Audited: admin GDPR export
        .select(
          "id, site_id, product_id, email, target_price, currency, is_active, triggered_at, created_at, updated_at",
        )
        .eq("site_id", site_id)
        .eq("email", lowerEmail),
      sb
        .from("drip_enrollments") // eslint-disable-line no-restricted-syntax -- Audited: admin GDPR export
        .select(
          "id, campaign_id, email, status, current_step, next_send_at, metadata, created_at, updated_at",
        )
        .eq("email", lowerEmail),
    ]);

    const queryErrors = [
      newslettersRes.error,
      membershipsRes.error,
      commentsRes.error,
      wristShotsRes.error,
      quizzesRes.error,
      priceAlertsRes.error,
      dripEnrollmentsRes.error,
    ].filter(Boolean);
    if (queryErrors.length > 0) {
      throw queryErrors[0];
    }

    const newsletters = newslettersRes.data;
    const memberships = membershipsRes.data;
    const comments = commentsRes.data;
    const wristShots = wristShotsRes.data;
    const quizzes = quizzesRes.data;
    const priceAlerts = priceAlertsRes.data;
    const dripEnrollments = dripEnrollmentsRes.data;

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
      actor: session.email ?? session.userId ?? "system",
      action: "gdpr_export",
      target_email_hash: hashEmail(email),
      site_id,
    });

    // OF-02: immutable audit row for the export (DSAR access right).
    await recordAuditEvent({
      site_id,
      actor: session.email ?? session.userId ?? "system",
      actor_user_id: session.userId,
      action: "gdpr_export",
      entity_type: "subject",
      entity_id: hashEmail(email),
      details: { target_email_hash: hashEmail(email) },
    });

    // A62-F1: GDPR Art. 20 data portability — support CSV format
    const format = searchParams.get("format");
    if (format === "csv") {
      /** Properly escape a CSV field value (RFC 4180). */
      function escapeCsv(val: string): string {
        if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }

      const csvRows: string[] = [];
      csvRows.push("table,id,email,created_at,data_json");
      for (const [table, rows] of Object.entries(exportPayload.data)) {
        for (const row of rows as Record<string, unknown>[]) {
          const id = String(row.id ?? "");
          const rowEmail = String(row.email ?? row.user_email ?? "");
          const createdAt = String(row.created_at ?? "");
          const dataJson = JSON.stringify(row);
          csvRows.push(
            [
              escapeCsv(table),
              escapeCsv(id),
              escapeCsv(rowEmail),
              escapeCsv(createdAt),
              escapeCsv(dataJson),
            ].join(","),
          );
        }
      }
      const csvContent = csvRows.join("\n");
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="data-export-${lowerEmail.replace(/[^a-z0-9]/g, "_")}.csv"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      export: exportPayload,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy] unexpected error during export" });
    return apiError(500, "Failed to process data export");
  }
});

export const DELETE = withAuthz("privacy", "delete", async (request, { session }) => {
  const rlResponse = await enforceAdminRateLimit("privacy-user", session);
  if (rlResponse) return rlResponse;

  if (session.role !== "super_admin") {
    return unauthorizedResponse();
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

  try {
    // OF-01: Atomic erasure via Postgres RPC — all deletes/anonymisations and
    // the audit_log insert happen inside a single transaction. No partial
    // erasure is possible even if the function raises mid-way.
    // OF-02: The RPC itself inserts into audit_log before returning.
    const { error } = await untypedRpc(sb, "erase_subject_data", {
      p_email: email.toLowerCase(),
      p_site_id: site_id,
      p_actor: session.email ?? session.userId ?? "system",
    });

    if (error) {
      captureException(error, { context: "[api/admin/privacy] erase_subject_data rpc failed" });
      return apiError(500, "Failed to process data erasure");
    }

    // Secondary audit record in application audit log (belt-and-suspenders).
    await recordAuditEvent({
      site_id,
      actor: session.email ?? session.userId ?? "system",
      actor_user_id: session.userId,
      action: "gdpr_erasure",
      entity_type: "subject",
      entity_id: hashEmail(email),
      details: { target_email_hash: hashEmail(email) },
    });

    return NextResponse.json({
      ok: true,
      message: "User data erased successfully",
      retained: ["affiliate_clicks", "audit_log"],
      retention_basis: "GDPR Art. 17(3)(e) — retention for legal/financial claims",
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy] unexpected error" });
    return apiError(500, "Failed to process data erasure");
  }
});

import crypto from "crypto";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

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
