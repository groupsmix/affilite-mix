import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  hasAnotherActiveSuperAdmin,
} from "@/lib/dal/admin-users";
import { hashPassword } from "@/lib/password";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

/** 100 admin API requests per minute per user session (3.30) */
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

/** GET /api/admin/users — list all admin users (super_admin only) */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  try {
    const users = await listAdminUsers();
    // Strip password_hash from response
    const safe = users.map(({ password_hash: _ph, ...rest }) => rest);
    return NextResponse.json(safe);
  } catch (err) {
    captureException(err, { context: "Failed to list admin users:" });
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}

/** POST /api/admin/users — create a new admin user */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only super_admin can create users
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
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

  const validRoles = ["admin", "super_admin"] as const;
  const userRole = validRoles.includes(role as (typeof validRoles)[number])
    ? (role as (typeof validRoles)[number])
    : "admin";

  try {
    const hashed = await hashPassword(password);
    const user = await createAdminUser({
      email,
      password_hash: hashed,
      name: name ?? "",
      role: userRole,
    });

    const { password_hash: _ph, ...safe } = user;
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
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only super_admin can update users
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
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
    const { password_hash: _ph, ...safe } = user;
    return NextResponse.json(safe);
  } catch (err) {
    captureException(err, { context: "Failed to update admin user:" });
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

/** DELETE /api/admin/users — delete an admin user */
export async function DELETE(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  // Only super_admin can delete users
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
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
