import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Per-route admin API limiter. Normal dashboard navigation triggers multiple
 * authenticated API calls, so keep this high enough for real use and fail open
 * if the distributed limiter binding is unavailable. Login/abuse-sensitive
 * public routes use their own stricter limiters.
 */
const ADMIN_RATE_LIMIT = {
  maxRequests: 300,
  windowMs: 60_000,
  failPolicy: "open" as const,
};

/**
 * Derive a stable, non-PII identity key for rate limiting.
 * Prefers userId (opaque); falls back to a SHA-256 hash of email.
 */
async function deriveIdentity(session: {
  email?: string | null;
  userId?: string | null;
}): Promise<string> {
  if (session.userId) return session.userId;
  if (session.email) {
    const bytes = new TextEncoder().encode(session.email.trim().toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }
  return "unknown";
}

/**
 * Enforce a per-session rate limit on admin endpoints.
 * Returns an HTTP 429 response if the limit is exceeded, or `null` if allowed.
 */
export async function enforceAdminRateLimit(
  routeKey: string,
  session: { email?: string | null; userId?: string | null },
): Promise<NextResponse | null> {
  const identity = await deriveIdentity(session);
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
