import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listRoles,
  listPermissions,
  listSiteUserRoles,
  assignUserSiteRole,
  removeUserSiteRole,
  getRoleByName,
} from "@/lib/dal/permissions";
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

/**
 * GET /api/admin/permissions — list roles, permissions, and site-user assignments
 *
 * Query params:
 *   - site_id: optional — if provided, returns user-role assignments for that site
 */
export async function GET(request: NextRequest) {
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

  try {
    const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);

    const response: {
      roles: typeof roles;
      permissions: typeof permissions;
      site_user_roles?: Awaited<ReturnType<typeof listSiteUserRoles>>;
    } = { roles, permissions };

    if (siteId) {
      response.site_user_roles = await listSiteUserRoles(siteId);
    }

    return NextResponse.json(response);
  } catch (err) {
    captureException(err, { context: "[api/admin/permissions] GET failed:" });
    const message = err instanceof Error ? err.message : "Failed to list permissions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/permissions — assign a role to a user for a site */
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

  const { user_id, site_id, role_name } = body as {
    user_id?: string;
    site_id?: string;
    role_name?: string;
  };

  if (!user_id || !site_id || !role_name) {
    return NextResponse.json(
      { error: "user_id, site_id, and role_name are required" },
      { status: 400 },
    );
  }

  try {
    const role = await getRoleByName(role_name);
    if (!role) {
      return NextResponse.json({ error: `Role not found: ${role_name}` }, { status: 404 });
    }

    const assignment = await assignUserSiteRole({
      user_id,
      site_id,
      role_id: role.id,
    });

    void recordAuditEvent({
      site_id,
      actor: session.email ?? "admin",
      action: "assign_role",
      entity_type: "user_site_role",
      entity_id: user_id,
      details: { role_name, role_id: role.id },
    });

    return NextResponse.json(assignment, { status: 200 });
  } catch (err) {
    captureException(err, { context: "[api/admin/permissions] POST failed:" });
    const message = err instanceof Error ? err.message : "Failed to assign role";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/permissions?user_id=<uuid>&site_id=<uuid> — remove role assignment */
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

  const userId = request.nextUrl.searchParams.get("user_id");
  const siteId = request.nextUrl.searchParams.get("site_id");

  if (!userId || !siteId) {
    return NextResponse.json({ error: "user_id and site_id are required" }, { status: 400 });
  }

  try {
    await removeUserSiteRole(userId, siteId);

    void recordAuditEvent({
      site_id: siteId,
      actor: session.email ?? "admin",
      action: "remove_role",
      entity_type: "user_site_role",
      entity_id: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/permissions] DELETE failed:" });
    const message = err instanceof Error ? err.message : "Failed to remove role";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
