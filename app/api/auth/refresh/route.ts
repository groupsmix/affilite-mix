import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSession,
  createToken,
  COOKIE_NAME,
  getAdminBindingCookie,
} from "@/lib/auth";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeRequestBinding } from "@/lib/jwt-binding";

/** 10 refresh requests per minute per session */
const REFRESH_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

/**
 * POST /api/auth/refresh
 * Re-issues the admin JWT if the current one is still valid.
 * Called periodically from the admin layout to prevent silent
 * logout during long editing sessions (8-hour token expiry).
 *
 * F-003: Token binding is preserved on refresh by passing the request
 * to createToken. Cookie maxAge is aligned with JWT expiry (8h).
 */
export async function POST(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rlKey = `auth-refresh:${session.email ?? session.userId ?? "unknown"}`;
  const rl = await checkRateLimit(rlKey, REFRESH_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  // F-003: Pass request to preserve token binding (bnd claim)
  const token = await createToken(session, request);
  const response = NextResponse.json({ ok: true });

  // F-003: Align cookie maxAge with JWT expiry (8 hours)
  const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  // F-003: Refresh the binding cookie to match the new token's binding
  const binding = await computeRequestBinding(request);
  if (binding) {
    const bc = getAdminBindingCookie(binding);
    response.cookies.set(bc.name, bc.value, bc.options as any);
  }

  return response;
}
