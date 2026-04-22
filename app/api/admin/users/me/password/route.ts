import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAdminUserByEmail } from "@/lib/dal/admin-users";
import { updateAdminUser } from "@/lib/dal/admin-users";
import { verifyPassword, hashPassword } from "@/lib/password";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";

/** POST /api/admin/users/me/password — change own password */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`admin:pw:${session.userId}`, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const currentPassword = (bodyOrError.current_password as string) ?? "";
  const newPassword = (bodyOrError.new_password as string) ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Both current and new passwords are required" },
      { status: 400 },
    );
  }

  const policyResult = validatePasswordPolicy(newPassword);
  if (!policyResult.valid) {
    return NextResponse.json({ error: policyResult.error }, { status: 400 });
  }

  try {
    const user = await getAdminUserByEmail(session.email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { valid } = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    const breached = await checkBreachedPassword(newPassword);
    if (breached) {
      return NextResponse.json(
        { error: "This password has appeared in a data breach. Please choose a different one." },
        { status: 400 },
      );
    }

    const newHash = await hashPassword(newPassword);
    await updateAdminUser(session.userId, { password_hash: newHash });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me/password] POST failed" });
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}
