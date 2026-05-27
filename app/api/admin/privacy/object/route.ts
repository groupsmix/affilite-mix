import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { getTenantClient } from "@/lib/supabase-server";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { unauthorizedResponse } from "@/lib/admin-guard";
import { untypedFrom } from "@/lib/dal/type-guards";

/**
 * POST /api/admin/privacy/object
 * GDPR Art. 21 — Right to Object to processing for direct marketing.
 * Records the subject's objection so marketing pipelines (newsletter,
 * ad targeting, analytics) can exclude them.
 *
 * DELETE /api/admin/privacy/object
 * Withdraws an existing objection (subject opts back in).
 */

export const POST = withAuthz("privacy", "manage", async (request, { session }) => {
  if (session.role !== "super_admin") {
    return unauthorizedResponse();
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id, scope, reason } = bodyOrError as {
    email?: string;
    site_id?: string;
    scope?: string;
    reason?: string;
  };

  if (!email || !site_id) {
    return apiError(400, "email and site_id are required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return apiError(400, "Invalid email format");
  }

  const validScopes = ["marketing", "profiling", "analytics", "all"];
  const resolvedScope = scope && validScopes.includes(scope) ? scope : "all";

  const sb = await getTenantClient();

  try {
    const { error } = await untypedFrom(sb, "subject_objections").upsert(
      {
        email: email.toLowerCase(),
        site_id,
        scope: resolvedScope,
        reason: reason ?? null,
        objected_at: new Date().toISOString(),
        created_by: session.email ?? session.userId,
        withdrawn_at: null,
      },
      { onConflict: "site_id,email,scope", ignoreDuplicates: false },
    );

    if (error) {
      captureException(error, { context: "[api/admin/privacy/object] upsert failed" });
      return apiError(500, "Failed to record objection");
    }

    await recordAuditEvent({
      site_id,
      actor: session.email ?? session.userId ?? "system",
      actor_user_id: session.userId,
      action: "gdpr.object",
      entity_type: "subject",
      entity_id: email.toLowerCase(),
      details: { scope: resolvedScope, reason: reason ?? null },
    });

    return NextResponse.json({ ok: true, message: "Marketing objection recorded" });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy/object] unexpected error" });
    return apiError(500, "Failed to process objection");
  }
});

export const DELETE = withAuthz("privacy", "delete", async (request, { session }) => {
  if (session.role !== "super_admin") {
    return unauthorizedResponse();
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, site_id, scope } = bodyOrError as {
    email?: string;
    site_id?: string;
    scope?: string;
  };

  if (!email || !site_id) {
    return apiError(400, "email and site_id are required");
  }

  const resolvedScope = scope ?? "all";
  const sb = await getTenantClient();

  try {
    const { error } = await untypedFrom(sb, "subject_objections")
      .update({ withdrawn_at: new Date().toISOString() })
      .eq("site_id", site_id)
      .eq("email", email.toLowerCase())
      .eq("scope", resolvedScope)
      .is("withdrawn_at", null);

    if (error) {
      captureException(error, { context: "[api/admin/privacy/object] withdraw failed" });
      return apiError(500, "Failed to withdraw objection");
    }

    await recordAuditEvent({
      site_id,
      actor: session.email ?? session.userId ?? "system",
      actor_user_id: session.userId,
      action: "gdpr.object.withdraw",
      entity_type: "subject",
      entity_id: email.toLowerCase(),
      details: { scope: resolvedScope },
    });

    return NextResponse.json({ ok: true, message: "Marketing objection withdrawn" });
  } catch (err) {
    captureException(err, { context: "[api/admin/privacy/object] unexpected error" });
    return apiError(500, "Failed to withdraw objection");
  }
});
