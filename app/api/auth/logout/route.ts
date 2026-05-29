import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, ACTIVITY_COOKIE, BINDING_COOKIE } from "@/lib/auth";
import { ACTIVE_SITE_COOKIE } from "@/lib/active-site";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { CSRF_COOKIE } from "@/lib/csrf";
import { revokeToken } from "@/lib/jwt-revocation";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";

/**
 * B-03: Clear every auth-related cookie on logout.
 *
 * Previously only the JWT and active-site cookies were cleared. The
 * binding cookie, activity cookie, and CSRF cookie were left behind,
 * which could confuse subsequent sessions or leak stale fingerprints.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-trace-id") ?? crypto.randomUUID();
  const log = logger.child({ requestId });

  log.info("logout");

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`logout:${ip}`, {
    maxRequests: 10,
    windowMs: 60_000,
    failPolicy: "grace" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (token) {
      try {
        // Decode without verifying just to get JTI for revocation
        const [, payloadStr] = token.split(".");
        const base64 = payloadStr.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64));
        if (payload.jti) {
          await revokeToken(payload.jti);
        }
      } catch (e) {
        captureException(e, { context: "[api/auth/logout] Failed to decode JWT for revocation" });
      }
    }
  } catch (err) {
    // Tests might run outside Next.js request context where cookies() throws
  }

  const response = NextResponse.json({ ok: true });

  // Clear the main JWT auth cookie
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  // B-03: Clear the binding cookie (UA/IP fingerprint)
  response.cookies.set(BINDING_COOKIE, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  // B-03: Clear the activity/idle-timeout cookie
  response.cookies.set(ACTIVITY_COOKIE, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  // Clear the active site cookie
  response.cookies.set(ACTIVE_SITE_COOKIE, "", {
    httpOnly: false, // Needs to be readable by client JS
    secure: IS_SECURE_COOKIE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // T-25 / B-03: clear the CSRF double-submit cookie too. Leaving it set
  // after logout is mostly cosmetic (the matching JWT cookie is gone, so
  // server-side checks already fail), but a stale `__csrf` cookie is a
  // confusing artefact that complicates incident response.
  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: true,
    secure: IS_SECURE_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
