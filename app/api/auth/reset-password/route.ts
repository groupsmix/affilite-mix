import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/password";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { revokeToken } from "@/lib/jwt-revocation";
import { COOKIE_NAME } from "@/lib/auth";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { hashResetToken, verifyResetToken } from "@/lib/reset-token";

/**
 * POST /api/auth/reset-password
 *
 * Accepts { token, password } and resets the user's password if the token
 * is valid and not expired.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    // Rate limit: 5 attempts per IP per 15 minutes
    const rl = await checkRateLimit(`reset-password:${ip}`, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const token = ((bodyOrError.token as string) ?? "").trim();
    const password = (bodyOrError.password as string) ?? "";

    if (!token) {
      return NextResponse.json({ error: "Reset token is required" }, { status: 400 });
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

    const sb = getServiceClient();

    // Look up the user by the SHA-256 hash of the submitted token. The DB
    // only ever stores the hash (see /api/auth/forgot-password); the raw
    // token lives exclusively in the reset email.
    const tokenHash = await hashResetToken(token);
    const { data: user, error: findError } = await sb
      .from("admin_users")
      .select("id, reset_token, reset_token_expires_at")
      .eq("reset_token", tokenHash)
      .eq("is_active", true)
      .single();

    if (findError || !user || !user.reset_token) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Defense-in-depth: timing-safe verification against the stored hash.
    // The equality query above already narrows to exactly one row, but
    // comparing through verifyResetToken means any future lookup change
    // (e.g. batching, caching, indexless fallbacks) stays timing-safe.
    const tokenMatches = await verifyResetToken(token, user.reset_token);
    if (!tokenMatches) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    // Check token expiry
    if (user.reset_token_expires_at && new Date(user.reset_token_expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Reset token has expired. Please request a new one." },
        { status: 400 },
      );
    }

    // Hash new password and update
    const newHash = await hashPassword(password);
    const { error: updateError } = await sb
      .from("admin_users")
      .update({
        password_hash: newHash,
        reset_token: null,
        reset_token_expires_at: null,
      })
      .eq("id", user.id);

    if (updateError) {
      captureException(updateError, {
        context: "[api/auth/reset-password] Failed to update password:",
      });
      return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
    }

    // Invalidate any existing session the user might have
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get(COOKIE_NAME)?.value;
      if (token) {
        const [, payloadStr] = token.split(".");
        const base64 = payloadStr.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64));
        if (payload.jti) {
          await revokeToken(payload.jti);
        }
      }
    } catch (e) {
      // Ignore malformed tokens
    }

    const response = NextResponse.json({
      ok: true,
      message: "Password has been reset successfully.",
    });

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
    captureException(err, { context: "[api/auth/reset-password] POST failed:" });
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
