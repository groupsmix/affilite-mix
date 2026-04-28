import { NextResponse } from "next/server";
import { getAdminSession, createToken, COOKIE_NAME } from "@/lib/auth";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { checkRateLimit } from "@/lib/rate-limit";

/** 10 refresh requests per minute per session */
const REFRESH_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

/**
 * POST /api/auth/refresh
 * Re-issues the admin JWT if the current one is still valid.
 * Called periodically from the admin layout to prevent silent
 * logout during long editing sessions (24-hour token expiry).
 */
export async function POST() {
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

  const token = await createToken(session);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}
