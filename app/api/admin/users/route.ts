import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
} from "@/lib/dal/admin-users";
import { hashPassword } from "@/lib/password";

/** GET /api/admin/users — list all admin users */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await listAdminUsers();
    // Strip password_hash from response
    const safe = users.map(({ password_hash: _ph, ...rest }) => rest);
    return NextResponse.json(safe);
  } catch (err) {
    console.error("Failed to list admin users:", err);
    return NextResponse.json(
      { error: "Failed to list users" },
      { status: 500 },
    );
  }
}

/** POST /api/admin/users — create a new admin user */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { email, password, name, role } = body as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  };

  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
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
    console.error("Failed to create admin user:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** PATCH /api/admin/users — update an admin user */
export async function PATCH(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, role, is_active, password } = body as {
    id?: string;
    name?: string;
    role?: string;
    is_active?: boolean;
    password?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;
    if (password) {
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 },
        );
      }
      updates.password_hash = await hashPassword(password);
    }

    const user = await updateAdminUser(id, updates);
    const { password_hash: _ph, ...safe } = user;
    return NextResponse.json(safe);
  } catch (err) {
    console.error("Failed to update admin user:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }
}

/** DELETE /api/admin/users — delete an admin user */
export async function DELETE(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteAdminUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete admin user:", err);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}
