import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import {
  listRoles,
  listPermissions,
  listSiteUserRoles,
  assignUserSiteRole,
  removeUserSiteRole,
  getRoleByName,
} from "@/lib/dal/permissions";
// FIX: `roles`/`permissions` are RLS-restricted to authenticated/service_role
// and `user_site_roles` to service_role only (migrations 00033 / 00040 /
// 2026052801). The default tenant client returns zero rows / is denied —
// when present, listSiteUserRoles() threw and poisoned the whole response, so
// the Roles + Permission Matrix never rendered. Use the privileged gateway;
// this route is gated by requireAdmin() + assertRole(super_admin).
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { recordAuditEvent } from "@/lib/audit-log";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
// Issue 4: validate UUIDs before passing to DAL functions (CWE-20).
import { isUsableUuid } from "@/lib/security/uuid";

/**
 * GET /api/admin/permissions — list roles, permissions, and site-user assignments
 *
 * Query params:
 *   - site_id: optional — if provided, returns user-role assignments for that site
 */
export async function GET(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("permissions", session);
  if (rlError) return rlError;

  // F-5: permissions are scoped to the active site; reject a client-supplied
  // site_id that does not match the server-derived site context.
  const requestedSiteId = request.nextUrl.searchParams.get("site_id");
  if (requestedSiteId && requestedSiteId !== dbSiteId) {
    return NextResponse.json({ error: "Invalid site_id" }, { status: 400 });
  }

  try {
    const getPrivileged = () => getPrivilegedSupabaseClient("admin-permissions-read");
    const [roles, permissions] = await Promise.all([
      listRoles(getPrivileged),
      listPermissions(getPrivileged),
    ]);

    const response: {
      roles: typeof roles;
      permissions: typeof permissions;
      site_user_roles?: Awaited<ReturnType<typeof listSiteUserRoles>>;
    } = { roles, permissions };

    if (dbSiteId) {
      response.site_user_roles = await listSiteUserRoles(dbSiteId, getPrivileged);
    }

    return NextResponse.json(response);
  } catch (err) {
    captureException(err, { context: "[api/admin/permissions] GET failed:" });
    return NextResponse.json({ error: "Failed to list permissions" }, { status: 500 });
  }
}

/** POST /api/admin/permissions — assign a role to a user for a site */
export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("permissions", session);
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

  // Issue 4: reject non-UUID / nil-UUID values before hitting the DAL.
  if (!isUsableUuid(user_id)) {
    return NextResponse.json({ error: "user_id must be a valid UUID" }, { status: 400 });
  }

  // F-5: assignments must target the server-derived active site; ignore any
  // site_id supplied by the client if it does not match the authenticated
  // admin's active site context.
  if (!isUsableUuid(site_id) || site_id !== dbSiteId) {
    return NextResponse.json({ error: "site_id must be a valid UUID" }, { status: 400 });
  }

  try {
    const role = await getRoleByName(role_name, () =>
      getPrivilegedSupabaseClient("admin-permissions-role-lookup"),
    );
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const assignment = await assignUserSiteRole(
      {
        user_id,
        site_id: dbSiteId,
        role_id: role.id,
      },
      () => getPrivilegedSupabaseClient("admin-permissions-assign"),
    );

    // G-06: Await audit for privilege-escalation action.
    await recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? "admin",
      action: "assign_role",
      entity_type: "user_site_role",
      entity_id: user_id,
      details: { role_name, role_id: role.id },
    });

    return NextResponse.json(assignment, { status: 200 });
  } catch (err) {
    captureException(err, { context: "[api/admin/permissions] POST failed:" });
    return NextResponse.json({ error: "Failed to assign role" }, { status: 500 });
  }
}

/** DELETE /api/admin/permissions?user_id=<uuid>&site_id=<uuid> — remove role assignment */
export async function DELETE(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("permissions", session);
  if (rlError) return rlError;

  const userId = request.nextUrl.searchParams.get("user_id");
  const requestedSiteId = request.nextUrl.searchParams.get("site_id");

  if (!userId || !requestedSiteId) {
    return NextResponse.json({ error: "user_id and site_id are required" }, { status: 400 });
  }

  // Issue 4: reject non-UUID / nil-UUID values before hitting the DAL.
  if (!isUsableUuid(userId)) {
    return NextResponse.json({ error: "user_id must be a valid UUID" }, { status: 400 });
  }

  // F-5: enforce the server-derived active site for privilege revocation.
  if (!isUsableUuid(requestedSiteId) || requestedSiteId !== dbSiteId) {
    return NextResponse.json({ error: "site_id must be a valid UUID" }, { status: 400 });
  }

  try {
    await removeUserSiteRole(userId, dbSiteId, () =>
      getPrivilegedSupabaseClient("admin-permissions-remove"),
    );

    // G-06: Await audit for privilege-revocation action.
    await recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? "admin",
      action: "remove_role",
      entity_type: "user_site_role",
      entity_id: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/permissions] DELETE failed:" });
    return NextResponse.json({ error: "Failed to remove role" }, { status: 500 });
  }
}
