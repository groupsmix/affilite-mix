import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/password";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";

/**
 * POST /api/auth/reset-password
 *
 * Accepts { token, password } and resets the user's password if the token
 * is valid and not expired.
 */
export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("cf-connecting-ip") ??
      "unknown";

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

    const body = await request.json();
    const token = (body.token ?? "").trim();
    const password = body.password ?? "";

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

    // Look up the user by reset token
    const { data: user, error: findError } = await sb
      .from("admin_users")
      .select("id, reset_token_expires_at")
      .eq("reset_token", token)
      .eq("is_active", true)
      .single();

    if (findError || !user) {
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

    return NextResponse.json({ ok: true, message: "Password has been reset successfully." });
  } catch (err) {
    captureException(err, { context: "[api/auth/reset-password] POST failed:" });
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
