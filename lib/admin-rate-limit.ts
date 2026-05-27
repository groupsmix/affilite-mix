import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/** 100 admin API requests per minute per user session. */
const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60_000 } as const;

/**
 * Enforce a per-session rate limit on admin endpoints.
 * Returns an HTTP 429 response if the limit is exceeded, or `null` if allowed.
 */
export async function enforceAdminRateLimit(
  routeKey: string,
  session: { email?: string | null; userId?: string | null },
): Promise<NextResponse | null> {
  const identity = session.email ?? session.userId ?? "unknown";
  const key = `admin:${routeKey}:${identity}`;
  const rl = await checkRateLimit(key, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000) || 60) } },
    );
  }
  return null;
}
