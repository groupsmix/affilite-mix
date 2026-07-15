import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";
import { apiError } from "@/lib/api-error";

/** 60 auth/me requests per minute per IP.
 * F-006: failPolicy: "closed" — auth endpoints must never silently skip
 * rate limiting when the distributed limiter is unavailable. */
const AUTH_ME_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-trace-id") ?? crypto.randomUUID();
  const log = logger.child({ requestId });

  log.info("auth/me");

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`auth-me:${ip}`, AUTH_ME_RATE_LIMIT);
  if (!rl.allowed) {
    return apiError(
      429,
      "Too many requests",
      undefined,
      { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      "RATE_LIMITED",
    );
  }

  const session = await getAdminSession();
  if (!session) {
    return apiError(401, "Not authenticated", undefined, undefined, "UNAUTHORIZED");
  }

  const activeSiteSlug = await getActiveSiteSlug();
  const activeSite = activeSiteSlug ? getSiteById(activeSiteSlug) : null;

  return NextResponse.json({
    role: session.role,
    email: session.email ?? null,
    activeSite: activeSite ? { id: activeSite.id, name: activeSite.name } : null,
  });
}
