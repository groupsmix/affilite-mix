import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSession,
  createToken,
  COOKIE_NAME,
  touchAdminActivity,
  getAdminBindingCookie,
} from "@/lib/auth";
import { computeRequestBinding } from "@/lib/jwt-binding";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { isOriginAllowed } from "@/lib/security/allowed-origins";
import { parseJsonBody } from "@/lib/api-error";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { verifyPassword } from "@/lib/password";
import { verifyTotpToken } from "@/lib/totp";
import { decryptTotpSecret } from "@/lib/totp-encryption";
import {
  ADMIN_JWT_EXPIRY_SECONDS,
  MAX_SESSION_AGE_REGULAR_SECONDS,
  MAX_SESSION_AGE_ADMIN_SECONDS,
} from "@/lib/auth-constants";

/**
 * 5 step-up attempts per 5 minutes per session. Fail-closed: if the rate-limit
 * backend is unavailable we deny rather than allow unbounded password guesses.
 * This bucket is the brute-force control for the re-verification endpoint.
 */
const STEP_UP_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 5 * 60 * 1000,
  failPolicy: "closed" as const,
};

/**
 * POST /api/auth/step-up
 *
 * F-030: Re-verify the *current* admin's identity (password, plus TOTP when 2FA
 * is enabled) inside an active session and re-mint the session cookie with a
 * fresh `step_up_at` timestamp. This is the escape hatch that lets a logged-in
 * super_admin perform step-up-gated destructive operations (site deletion, user
 * role changes, user deletion) once the step-up window minted at login has
 * elapsed — without a full logout/login cycle.
 *
 * CSRF: this is a normal state-changing admin request and is intentionally NOT
 * in the CSRF-exempt registry — the client must send the x-csrf-token header
 * (callers use fetchWithCsrf / fetchWithStepUp). SameSite=Strict + the Origin
 * check below provide defence-in-depth.
 */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // F-API-06: Origin check as defence-in-depth against CSRF (matches refresh).
  if (
    !isOriginAllowed(
      request.headers.get("origin"),
      request.headers.get("host"),
      request.headers.get("x-site-id"),
    )
  ) {
    return NextResponse.json({ error: "Forbidden: cross-origin request" }, { status: 403 });
  }

  const rlKey = `auth-step-up:${session.userId ?? session.email ?? "unknown"}`;
  const rl = await checkRateLimit(rlKey, STEP_UP_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { password, totp_token } = bodyOrError as { password?: string; totp_token?: string };

  if (!session.email || typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  try {
    const user = await getAdminUserByEmail(session.email);

    // Generic failure — never reveal which factor (password vs. 2FA) failed.
    const invalid = NextResponse.json(
      { error: "Verification failed. Check your password and, if enabled, your 2FA code." },
      { status: 401 },
    );

    if (!user || !user.password_hash) return invalid;

    const pw = await verifyPassword(password, user.password_hash);
    if (!pw.valid) return invalid;

    // Enforce TOTP when the account has 2FA enabled.
    if (user.totp_enabled) {
      // Validate the token shape before passing to verifyTotpToken so its
      // `token: string` parameter is satisfied (totp_token is `string |
      // undefined` from the request body parse).
      if (typeof totp_token !== "string" || !/^\d{6}$/.test(totp_token)) {
        return invalid;
      }
      // F4 audit: single-use TOTP check with replay protection. Passing
      // user.totp_last_step closes the ~90s window in which a captured
      // code could previously be replayed.
      const totpResult = user.totp_secret
        ? verifyTotpToken(
            await decryptTotpSecret(user.totp_secret),
            totp_token,
            { lastStep: user.totp_last_step },
          )
        : { ok: false, step: null };
      if (!totpResult.ok) {
        return invalid;
      }
      // F4: persist the consumed step so the same code can't be replayed.
      // Best-effort; a failure here means the next code in the window may
      // still pass (replay still possible for that one window), but this
      // is preferable to blocking a legitimately verified step-up.
      if (totpResult.step != null) {
        try {
          await updateAdminUser(user.id, { totp_last_step: totpResult.step });
        } catch {
          // fail-open: best-effort [criticality:non-critical]
          // step-up verification already succeeded; persistence is a
          // best-effort hardening, not a correctness invariant.
        }
      }
    }

    // Re-mint the session with a fresh step-up timestamp (milliseconds). All
    // other claims (role, userId, session_start, …) are carried forward, so the
    // absolute session lifetime computed below is unaffected.
    const refreshed = { ...session, step_up_at: Date.now() };
    if (!refreshed.session_start) {
      refreshed.session_start = Math.floor(Date.now() / 1000);
    }

    const token = await createToken(refreshed, request);
    const response = NextResponse.json({ ok: true });

    // Mirror /api/auth/refresh cookie handling so absolute-lifetime, binding,
    // and idle-activity cookies stay consistent with the re-minted token.
    const absoluteMaxAge =
      refreshed.role === "super_admin"
        ? MAX_SESSION_AGE_ADMIN_SECONDS
        : MAX_SESSION_AGE_REGULAR_SECONDS;
    const elapsed = Math.floor(Date.now() / 1000) - (refreshed.session_start ?? 0);
    const remaining = Math.max(0, absoluteMaxAge - elapsed);
    const cookieMaxAge = Math.min(ADMIN_JWT_EXPIRY_SECONDS, remaining);

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict",
      path: "/",
      maxAge: cookieMaxAge,
    });

    const binding = await computeRequestBinding(request, refreshed.role);
    if (binding) {
      const bc = getAdminBindingCookie(binding);
      response.cookies.set(
        bc.name,
        bc.value,
        bc.options as Parameters<NextResponse["cookies"]["set"]>[2],
      );
    }

    const activity = await touchAdminActivity();
    response.cookies.set(
      activity.name,
      activity.value,
      activity.options as Parameters<NextResponse["cookies"]["set"]>[2],
    );

    return response;
  } catch (err) {
    captureException(err, { context: "[api/auth/step-up] POST failed:" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
