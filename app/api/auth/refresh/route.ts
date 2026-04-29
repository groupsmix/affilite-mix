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

/** 10 refresh requests per minute per session */
const REFRESH_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

/**
 * POST /api/auth/refresh
 * Re-issues the admin JWT if the current one is still valid.
 * Called periodically from the admin layout to prevent silent
 * logout during long editing sessions (8-hour token expiry).
 *
 * P0-1: The refresh route now passes the NextRequest to createToken so
 * the refreshed token preserves the bnd claim. The binding cookie and
 * activity cookie are re-issued alongside the token, and the cookie
 * maxAge is aligned to the 8h JWT expiry.
 */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // F-API-06: Add Origin check as defence-in-depth against CSRF, even though
  // SameSite=Strict is also enforced by the browser.
  if (!isOriginAllowed(request.headers.get("origin"), request.headers.get("host"), request.headers.get("x-site-id"))) {
    return NextResponse.json({ error: "Forbidden: cross-origin request" }, { status: 403 });
  }

  const rlKey = `auth-refresh:${session.email ?? session.userId ?? "unknown"}`;
  const rl = await checkRateLimit(rlKey, REFRESH_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  try {
    // P0-1: Pass the request so the refreshed token includes the bnd claim.
    const token = await createToken(session, request);
    const response = NextResponse.json({ ok: true });

    // P0-1 / F-SEC-03: Align cookie maxAge with JWT expiry (4h).
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 4, // 4 hours — matches JWT EXPIRY
    });

    // P0-1: Re-issue the binding cookie so it stays in sync with the
    // freshly-minted JWT bnd claim.
    const binding = await computeRequestBinding(request, session.role);
    if (binding) {
      const bc = getAdminBindingCookie(binding);
      response.cookies.set(
        bc.name,
        bc.value,
        bc.options as Parameters<NextResponse["cookies"]["set"]>[2],
      );
    }

    // P0-1: Touch the activity cookie so the idle timeout resets on refresh.
    const activity = await touchAdminActivity();
    response.cookies.set(
      activity.name,
      activity.value,
      activity.options as Parameters<NextResponse["cookies"]["set"]>[2],
    );

    return response;
  } catch (err) {
    captureException(err, { context: "[api/auth/refresh] POST failed:" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
