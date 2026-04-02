import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listSiteFeatureFlags,
  upsertFeatureFlag,
  bulkUpsertFeatureFlags,
  deleteFeatureFlag,
} from "@/lib/dal/feature-flags";
import { recordAuditEvent } from "@/lib/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

async function enforceRateLimit(email: string | undefined, userId: string | undefined) {
  const key = `admin:${email ?? userId ?? "unknown"}`;
  const rl = await checkRateLimit(key, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }
  return null;
}

/** GET /api/admin/feature-flags?site_id=<uuid> — list feature flags for a site */
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const siteId = request.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id is required" }, { status: 400 });
  }

  try {
    const flags = await listSiteFeatureFlags(siteId);
    return NextResponse.json({ flags });
  } catch (err) {
    captureException(err, { context: "[api/admin/feature-flags] GET failed:" });
    const message = err instanceof Error ? err.message : "Failed to list feature flags";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/feature-flags — upsert a feature flag */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError;

  const { site_id, flag_key, is_enabled } = body as {
    site_id?: string;
    flag_key?: string;
    is_enabled?: boolean;
  };

  if (!site_id || !flag_key || is_enabled === undefined) {
    return NextResponse.json(
      { error: "site_id, flag_key, and is_enabled are required" },
      { status: 400 },
    );
  }

  try {
    const flag = await upsertFeatureFlag({
      site_id,
      flag_key,
      is_enabled,
      description: (body.description as string) ?? "",
    });

    recordAuditEvent({
      site_id,
      actor: session.email ?? "admin",
      action: is_enabled ? "enable_feature_flag" : "disable_feature_flag",
      entity_type: "feature_flag",
      entity_id: flag_key,
      details: { flag_key, is_enabled },
    });

    return NextResponse.json(flag, { status: 200 });
  } catch (err) {
    captureException(err, { context: "[api/admin/feature-flags] POST failed:" });
    const message = err instanceof Error ? err.message : "Failed to upsert feature flag";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/admin/feature-flags — bulk upsert feature flags */
export async function PATCH(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError;

  const { site_id, flags } = body as {
    site_id?: string;
    flags?: { flag_key: string; is_enabled: boolean; description?: string }[];
  };

  if (!site_id || !flags || !Array.isArray(flags)) {
    return NextResponse.json({ error: "site_id and flags array are required" }, { status: 400 });
  }

  try {
    const results = await bulkUpsertFeatureFlags(site_id, flags);

    recordAuditEvent({
      site_id,
      actor: session.email ?? "admin",
      action: "bulk_update_feature_flags",
      entity_type: "feature_flag",
      entity_id: site_id,
      details: { flags_count: flags.length },
    });

    return NextResponse.json({ flags: results });
  } catch (err) {
    captureException(err, { context: "[api/admin/feature-flags] PATCH failed:" });
    const message = err instanceof Error ? err.message : "Failed to bulk upsert feature flags";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/feature-flags?site_id=<uuid>&flag_key=<key> — delete a flag */
export async function DELETE(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const siteId = request.nextUrl.searchParams.get("site_id");
  const flagKey = request.nextUrl.searchParams.get("flag_key");

  if (!siteId || !flagKey) {
    return NextResponse.json({ error: "site_id and flag_key are required" }, { status: 400 });
  }

  try {
    await deleteFeatureFlag(siteId, flagKey);

    recordAuditEvent({
      site_id: siteId,
      actor: session.email ?? "admin",
      action: "delete_feature_flag",
      entity_type: "feature_flag",
      entity_id: flagKey,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/feature-flags] DELETE failed:" });
    const message = err instanceof Error ? err.message : "Failed to delete feature flag";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
