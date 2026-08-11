import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/admin-guard";
import { COOKIE_NAME } from "@/lib/auth";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { verifyPassword, hashPassword } from "@/lib/password";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
// RISK-05 (étap-3): Use strong revocation for immediate in-isolate effect
import { revokeTokenStrong } from "@/lib/jwt-revocation-strong";
// A100-3: Safe JWT claim decoding (replaces unsafe JSON.parse(atob()))
import { decodeJwtClaims } from "@/lib/decode-jwt-claims";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";

/** POST /api/admin/users/me/password — change own password */
export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin(request);
  if (error) return error;
  if (!session || !session.userId || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // P0-5: failPolicy: "closed" on password change.
  const rl = await checkRateLimit(`admin:pw:${session.userId}`, {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    failPolicy: "closed" as const,
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
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const breached = await checkBreachedPassword(newPassword);
    if (breached > 0) {
      return NextResponse.json(
        { error: "This password has appeared in a data breach. Please choose a different one." },
        { status: 400 },
      );
    }

    const newHash = await hashPassword(newPassword);
    await updateAdminUser(session.userId, { password_hash: newHash });

    // Invalidate the current session to force a fresh login with the new password
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get(COOKIE_NAME)?.value;
      if (token) {
        // A100-3: jose.decodeJwt() validates 3-part token structure and returns a typed
        // JWTPayload — no __proto__/constructor keys can leak into the result.
        const claims = decodeJwtClaims(token);
        if (claims?.jti && typeof claims.jti === "string") {
          await revokeTokenStrong(claims.jti);
        }
      }
    } catch (e) {
      captureException(e, {
        context: "[api/admin/users/me/password] Failed to decode JWT for revocation",
      });
    }

    const response = NextResponse.json({ ok: true });

    // Clear cookies
    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });

    response.cookies.set(ACTIVE_SITE_COOKIE, "", {
      httpOnly: false,
      secure: IS_SECURE_COOKIE,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me/password] POST failed" });
    return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
  }
}
