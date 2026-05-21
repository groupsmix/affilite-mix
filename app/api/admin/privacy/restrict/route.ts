import { NextRequest, NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { getTenantClient } from "@/lib/supabase-server";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { unauthorizedResponse } from "@/lib/admin-guard";

/**
 * POST /api/admin/privacy/restrict
 * OF-03: GDPR Art. 18 — Right to Restriction of Processing.
 * Places a restriction marker on a subject so downstream processors can
 * check it before using the data for non-storage purposes.
 *
 * DELETE /api/admin/privacy/restrict
 * Lifts an existing restriction (Art. 18(4) — notify subject before lifting).
 */

export const POST = withAuthz("privacy", "manage", async (request, { session }) => {
  if (session.role !== "super_admin") {
    return unauthorizedResponse();
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id, reason } = bodyOrError as {
    email?: string;
    site_id?: string;
    reason?: string;
  };

  if (!email || !site_id) {
    return apiError(400, "email and site_id are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return apiError(400, "Invalid email format");
  }

  const sb = await getTenantClient();

  try {
    const { error } = await (sb.from as any)("subject_restrictions").upsert(
      {
        email: email.toLowerCase(),
        site_id,
        reason: reason ?? null,
        restricted_at: new Date().toISOString(),
        created_by: session.email ?? session.userId,
        lifted_at: null,
      },
      { onConflict: "site_id,email", ignoreDuplicates: false },
    );

    if (error) {
      captureException(error, { context: "[api/admin/privacy/restrict] upsert failed" });
      return apiError(500, "Failed to place restriction");
    }

    await recordAuditEvent({
      site_id,
      actor: session.email ?? session.userId ?? "system",
      actor_user_id: session.userId,
      action: "gdpr.restrict",
      entity_type: "subject",
      entity_id: email.toLowerCase(),
      details: { reason: reason ?? null },
    });

    return NextResponse.json({ ok: true, message: "Processing restriction placed" });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy/restrict] unexpected error" });
    return apiError(500, "Failed to process restriction request");
  }
});

export const DELETE = withAuthz("privacy", "delete", async (request, { session }) => {
  if (session.role !== "super_admin") {
    return unauthorizedResponse();
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id } = bodyOrError as { email?: string; site_id?: string };

  if (!email || !site_id) {
    return apiError(400, "email and site_id are required");
  }

  const sb = await getTenantClient();

  try {
    const { error } = await (sb.from as any)("subject_restrictions")
      .update({ lifted_at: new Date().toISOString() })
      .eq("site_id", site_id)
      .eq("email", email.toLowerCase())
      .is("lifted_at", null);

    if (error) {
      captureException(error, { context: "[api/admin/privacy/restrict] lift failed" });
      return apiError(500, "Failed to lift restriction");
    }

    await recordAuditEvent({
      site_id,
      actor: session.email ?? session.userId ?? "system",
      actor_user_id: session.userId,
      action: "gdpr.restrict.lift",
      entity_type: "subject",
      entity_id: email.toLowerCase(),
      details: {},
    });

    return NextResponse.json({ ok: true, message: "Processing restriction lifted" });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy/restrict] unexpected error" });
    return apiError(500, "Failed to lift restriction");
  }
});
