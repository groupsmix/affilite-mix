import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { getTenantClient } from "@/lib/supabase-server";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { logger } from "@/lib/logger";
import { unauthorizedResponse } from "@/lib/admin-guard";
import { untypedFrom } from "@/lib/dal/type-guards";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import crypto from "crypto";

/**
 * POST /api/admin/privacy/rectify
 * S3-004: GDPR Art. 16 — Right to Rectification.
 * Allows a super-admin to correct inaccurate personal data for a data subject,
 * with a full audit trail mirroring the export/erasure pattern.
 *
 * Rectifiable tables & fields:
 *   - newsletter_subscribers: email
 *   - memberships: email, name
 *   - comments: user_email, user_name
 *   - wrist_shots: user_email, user_name
 *   - quiz_submissions: email
 *   - price_alerts: email
 *   - drip_enrollments: email
 */

/** Tables and their rectifiable PII columns. */
const RECTIFIABLE_FIELDS: Record<string, { emailCol: string; nameCol?: string }> = {
  newsletter_subscribers: { emailCol: "email" },
  memberships: { emailCol: "email", nameCol: "name" },
  comments: { emailCol: "user_email", nameCol: "user_name" },
  wrist_shots: { emailCol: "user_email", nameCol: "user_name" },
  quiz_submissions: { emailCol: "email" },
  price_alerts: { emailCol: "email" },
  drip_enrollments: { emailCol: "email" },
};

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

export const POST = withAuthz("privacy", "manage", async (request, { session }) => {
  const rlResponse = await enforceAdminRateLimit("privacy-rectify", session);
  if (rlResponse) return rlResponse;

  if (session.role !== "super_admin") {
    return unauthorizedResponse();
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id, corrections } = bodyOrError as {
    email?: string;
    site_id?: string;
    corrections?: { new_email?: string; new_name?: string };
  };

  if (!email || !site_id) {
    return apiError(400, "email and site_id are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return apiError(400, "Invalid email format");
  }

  if (!corrections || (!corrections.new_email && !corrections.new_name)) {
    return apiError(400, "corrections object with at least new_email or new_name is required");
  }

  if (corrections.new_email && !emailRegex.test(corrections.new_email)) {
    return apiError(400, "Invalid new_email format");
  }

  if (corrections.new_name !== undefined && typeof corrections.new_name !== "string") {
    return apiError(400, "new_name must be a string");
  }

  if (corrections.new_name !== undefined && corrections.new_name.length > 255) {
    return apiError(400, "new_name exceeds maximum length of 255 characters");
  }

  const sb = await getTenantClient();
  const lowerEmail = email.toLowerCase();
  const updatedTables: string[] = [];

  try {
    for (const [table, cols] of Object.entries(RECTIFIABLE_FIELDS)) {
      const updates: Record<string, string> = {};

      if (corrections.new_email) {
        updates[cols.emailCol] = corrections.new_email.toLowerCase();
      }
      if (corrections.new_name && cols.nameCol) {
        updates[cols.nameCol] = corrections.new_name;
      }

      if (Object.keys(updates).length === 0) continue;

      const query = untypedFrom(sb, table).update(updates).eq(cols.emailCol, lowerEmail);

      // drip_enrollments has no site_id column — it is campaign-scoped
      const result =
        table === "drip_enrollments" ? await query : await query.eq("site_id", site_id);

      if (result.error) {
        captureException(result.error, {
          context: `[api/admin/privacy/rectify] update ${table} failed`,
        });
        return apiError(500, `Failed to rectify data in ${table}`);
      }

      updatedTables.push(table);
    }

    logger.info("GDPR data rectification performed", {
      action: "gdpr_rectify",
      target_email_hash: hashEmail(email),
      site_id,
      tables: updatedTables.join(","),
    });

    await recordAuditEvent({
      site_id,
      actor: session.email ?? session.userId ?? "system",
      actor_user_id: session.userId,
      action: "gdpr.rectify",
      entity_type: "subject",
      entity_id: hashEmail(email),
      details: {
        tables: updatedTables,
        fields_corrected: Object.keys(corrections).filter(
          (k) => corrections[k as keyof typeof corrections] !== undefined,
        ),
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Data rectified successfully",
      updated_tables: updatedTables,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy/rectify] unexpected error" });
    return apiError(500, "Failed to process rectification request");
  }
});
