import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  createAdminApiToken,
  listAdminApiTokens,
  type AdminApiTokenPublic,
} from "@/lib/dal/admin-api-tokens";
import { generateSecretToken, hashSecretToken } from "@/lib/generate-token";

const DEFAULT_TOKEN_TTL_DAYS = 30;

export async function GET(request: NextRequest) {
  const { error, session } = await requireAdmin(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  try {
    const tokens = await listAdminApiTokens();
    const result: AdminApiTokenPublic[] = tokens;
    return NextResponse.json({ tokens: result });
  } catch (err) {
    captureException(err, { context: "[api/admin/api-tokens] GET failed" });
    return NextResponse.json({ error: "Failed to list API tokens" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError as {
    name?: unknown;
    scope?: unknown;
    site_id?: unknown;
    ttl_days?: unknown;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 128) {
    return NextResponse.json({ error: "name is required (max 128 chars)" }, { status: 400 });
  }

  // Scope selection. `scope: "site"` binds the token to the current active
  // site (its DB id is taken from the authenticated context, never request
  // input); `scope: "all"` (default) mints an all-sites token. The legacy
  // explicit `site_id` body field is still honoured for backwards
  // compatibility, but must be a valid UUID.
  let siteId: string | null = null;
  if (body.scope === "site") {
    siteId = dbSiteId;
  } else if (body.scope === "all") {
    siteId = null;
  } else if (typeof body.site_id === "string") {
    if (!/^[0-9a-fA-F-]{36}$/.test(body.site_id)) {
      return NextResponse.json({ error: "site_id must be a valid UUID" }, { status: 400 });
    }
    siteId = body.site_id;
  }

  const ttlRaw = typeof body.ttl_days === "number" ? body.ttl_days : DEFAULT_TOKEN_TTL_DAYS;
  const ttlDays =
    Number.isFinite(ttlRaw) && ttlRaw > 0 && ttlRaw <= 365 ? ttlRaw : DEFAULT_TOKEN_TTL_DAYS;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const token = generateSecretToken("aadm");
  const tokenHash = await hashSecretToken(token);

  try {
    const row = await createAdminApiToken({
      site_id: siteId,
      token_hash: tokenHash,
      name,
      created_by: session.userId!,
      expires_at: expiresAt.toISOString(),
      is_active: true,
    });

    await recordAuditEvent({
      site_id: siteId ?? "_global",
      actor: session.email ?? "admin",
      actor_user_id: session.userId,
      action: "admin_api_token.created",
      entity_type: "admin_api_token",
      entity_id: row.id,
      details: { name, expires_at: row.expires_at, site_id: siteId },
    });

    return NextResponse.json({
      token: {
        id: row.id,
        name: row.name,
        site_id: row.site_id,
        expires_at: row.expires_at,
        created_at: row.created_at,
      },
      // The raw token is shown exactly once — it is never stored in the clear.
      plain_token: token,
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/api-tokens] POST failed" });
    return NextResponse.json({ error: "Failed to create API token" }, { status: 500 });
  }
}
