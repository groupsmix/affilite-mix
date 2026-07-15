import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { generateSecretToken, hashSecretToken } from "@/lib/generate-token";
import { assertGrantableScopes } from "@/lib/automation/scopes";
import {
  createAutomationServiceAccount,
  listAutomationServiceAccountsForSite,
} from "@/lib/dal/automation-service-accounts";
import { createAutomationToken } from "@/lib/dal/automation-tokens";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const DEFAULT_TOKEN_TTL_DAYS = 90;

// GET /api/admin/automation/service-accounts?site_id=<uuid>
// Lists the automation service accounts for a site (super_admin only). Token
// hashes are never returned.
export async function GET(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const siteId = request.nextUrl.searchParams.get("site_id");
  if (!siteId || !UUID_RE.test(siteId)) {
    return NextResponse.json({ error: "site_id (uuid) query param is required" }, { status: 400 });
  }

  try {
    const accounts = await listAutomationServiceAccountsForSite(siteId);
    return NextResponse.json({ service_accounts: accounts });
  } catch (err) {
    captureException(err, { context: "[api/admin/automation/service-accounts] GET failed" });
    return NextResponse.json({ error: "Failed to list service accounts" }, { status: 500 });
  }
}

// POST /api/admin/automation/service-accounts
// Provisions a site-bound automation service account and issues its first
// bearer token. The raw token is returned exactly once (only its hash is
// stored). super_admin only.
export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError as {
    name?: unknown;
    site_id?: unknown;
    scopes?: unknown;
    max_actions_per_run?: unknown;
    max_actions_per_day?: unknown;
    ttl_days?: unknown;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 128) {
    return NextResponse.json({ error: "name is required (max 128 chars)" }, { status: 400 });
  }

  const siteId = typeof body.site_id === "string" ? body.site_id : "";
  if (!UUID_RE.test(siteId)) {
    return NextResponse.json({ error: "site_id must be a valid UUID" }, { status: 400 });
  }

  const rawScopes = Array.isArray(body.scopes)
    ? body.scopes.filter((s): s is string => typeof s === "string")
    : [];
  let scopes: string[];
  try {
    scopes = assertGrantableScopes(rawScopes);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid scopes" },
      { status: 400 },
    );
  }

  const perRun =
    typeof body.max_actions_per_run === "number" && body.max_actions_per_run >= 0
      ? Math.floor(body.max_actions_per_run)
      : 25;
  const perDay =
    typeof body.max_actions_per_day === "number" && body.max_actions_per_day >= 0
      ? Math.floor(body.max_actions_per_day)
      : 200;

  const ttlRaw = typeof body.ttl_days === "number" ? body.ttl_days : DEFAULT_TOKEN_TTL_DAYS;
  const ttlDays =
    Number.isFinite(ttlRaw) && ttlRaw > 0 && ttlRaw <= 365 ? ttlRaw : DEFAULT_TOKEN_TTL_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const rawToken = generateSecretToken("atk");
  const tokenHash = await hashSecretToken(rawToken);

  try {
    const account = await createAutomationServiceAccount({
      site_id: siteId,
      name,
      status: "active",
      scopes,
      allowed_ip_ranges: null,
      max_actions_per_run: perRun,
      max_actions_per_day: perDay,
      created_by: session.userId!,
    });

    const token = await createAutomationToken({
      service_account_id: account.id,
      token_hash: tokenHash,
      name: "default",
      expires_at: expiresAt.toISOString(),
      created_by: session.userId!,
    });

    await recordAuditEvent({
      site_id: siteId,
      actor: session.email ?? "admin",
      actor_user_id: session.userId,
      action: "automation.service_account.created",
      entity_type: "automation_service_account",
      entity_id: account.id,
      details: { name, scopes, token_id: token.id, expires_at: token.expires_at },
    });

    return NextResponse.json(
      {
        service_account: {
          id: account.id,
          site_id: account.site_id,
          name: account.name,
          status: account.status,
          scopes: account.scopes,
          max_actions_per_run: account.max_actions_per_run,
          max_actions_per_day: account.max_actions_per_day,
          created_at: account.created_at,
        },
        token: { id: token.id, expires_at: token.expires_at },
        // The raw bearer token is shown exactly once; only its hash is stored.
        plain_token: rawToken,
      },
      { status: 201 },
    );
  } catch (err) {
    captureException(err, { context: "[api/admin/automation/service-accounts] POST failed" });
    return NextResponse.json({ error: "Failed to create service account" }, { status: 500 });
  }
}
