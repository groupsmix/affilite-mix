import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  hasAnotherActiveSuperAdmin,
} from "@/lib/dal/admin-users";
import { hashPassword } from "@/lib/password";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { requireStepUpAuth } from "@/lib/step-up-auth";
import { isUsableUuid } from "@/lib/security/uuid";

const VALID_ADMIN_ROLES = ["admin", "super_admin"] as const;

/** GET /api/admin/users — list all admin users (super_admin only) */
export async function GET() {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("users", session);
  if (rlError) return rlError;

  try {
    const users = await listAdminUsers();
    return NextResponse.json(users);
  } catch (err) {
    captureException(err, { context: "Failed to list admin users:" });
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}

/** POST /api/admin/users — create a new admin user */
export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only super_admin can create users.
  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const rlError = await enforceAdminRateLimit("users", session);
  if (rlError) return rlError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { email, password, name, role } = bodyOrError as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const policyResult = validatePasswordPolicy(password);
  if (!policyResult.valid) {
    return NextResponse.json({ error: policyResult.error }, { status: 400 });
  }

  const breachCount = await checkBreachedPassword(password);
  if (breachCount > 0) {
    return NextResponse.json(
      {
        error:
          "This password has appeared in a known data breach. Please choose a different password.",
      },
      { status: 400 },
    );
  }

  const userRole = VALID_ADMIN_ROLES.includes(role as (typeof VALID_ADMIN_ROLES)[number])
    ? (role as (typeof VALID_ADMIN_ROLES)[number])
    : "admin";

  try {
    const hashed = await hashPassword(password);
    const user = await createAdminUser({
      email,
      password_hash: hashed,
      name: name ?? "",
      role: userRole,
    });

    const { password_hash: _ph, totp_secret: _ts, ...safe } = user;
    return NextResponse.json(safe, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("duplicate")
        ? "An admin user with this email already exists"
        : "Failed to create user";
    captureException(err, { context: "Failed to create admin user:" });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** PATCH /api/admin/users — update an admin user */
export async function PATCH(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only super_admin can update users.
  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  // FIX-18 (F-030): Step-up auth required for role changes and user updates
  const stepUpError = requireStepUpAuth(session);
  if (stepUpError) return stepUpError;

  const rlError = await enforceAdminRateLimit("users", session);
  if (rlError) return rlError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { id, name, role, is_active, password } = bodyOrError as {
    id?: string;
    name?: string;
    role?: string;
    is_active?: boolean;
    password?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (!isUsableUuid(id)) {
    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  }

  if (
    role !== undefined &&
    !VALID_ADMIN_ROLES.includes(role as (typeof VALID_ADMIN_ROLES)[number])
  ) {
    return NextResponse.json({ error: "role must be one of: admin, super_admin" }, { status: 400 });
  }

  // Prevent demoting or deactivating the last active super_admin.
  const wouldDemote = role !== undefined && role !== "super_admin";
  const wouldDeactivate = is_active === false;
  if (wouldDemote || wouldDeactivate) {
    const users = await listAdminUsers();
    const target = users.find((u) => u.id === id);
    if (target && target.role === "super_admin" && target.is_active) {
      const hasOther = await hasAnotherActiveSuperAdmin(id);
      if (!hasOther) {
        return NextResponse.json(
          { error: "Cannot demote or deactivate the last active super_admin" },
          { status: 409 },
        );
      }
    }
  }

  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;
    if (password) {
      const policyCheck = validatePasswordPolicy(password);
      if (!policyCheck.valid) {
        return NextResponse.json({ error: policyCheck.error }, { status: 400 });
      }
      const breaches = await checkBreachedPassword(password);
      if (breaches > 0) {
        return NextResponse.json(
          {
            error:
              "This password has appeared in a known data breach. Please choose a different password.",
          },
          { status: 400 },
        );
      }
      updates.password_hash = await hashPassword(password);
    }

    const user = await updateAdminUser(id, updates);
    const { password_hash: _ph, totp_secret: _ts, ...safe } = user;
    return NextResponse.json(safe);
  } catch (err) {
    captureException(err, { context: "Failed to update admin user:" });
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

/** DELETE /api/admin/users — delete an admin user */
export async function DELETE(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only super_admin can delete users. Run this *before* the step-up check so
  // we don't leak the existence of the step-up gate to unauthorized callers
  // (matches the ordering used by PATCH and admin/sites DELETE).
  // G-45: standardised 401 + Bearer challenge instead of 403.
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  // FIX-18 (F-030): Step-up auth required for user deletion
  const stepUpError = requireStepUpAuth(session);
  if (stepUpError) return stepUpError;

  const rlError = await enforceAdminRateLimit("users", session);
  if (rlError) return rlError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (!isUsableUuid(id)) {
    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  }

  // Prevent self-deletion
  if (id === session.userId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  // Prevent deleting the last active super_admin.
  const users = await listAdminUsers();
  const target = users.find((u) => u.id === id);
  if (target && target.role === "super_admin" && target.is_active) {
    const hasOther = await hasAnotherActiveSuperAdmin(id);
    if (!hasOther) {
      return NextResponse.json(
        { error: "Cannot delete the last active super_admin" },
        { status: 409 },
      );
    }
  }

  try {
    await deleteAdminUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "Failed to delete admin user:" });
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
