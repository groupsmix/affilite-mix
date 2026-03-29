import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verify cron job authentication via Authorization header.
 * Expects: Authorization: Bearer <CRON_SECRET>
 *
 * Returns true if CRON_SECRET is not set (dev mode) or if the token matches.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // In development without CRON_SECRET, allow all requests
  if (!cronSecret) return true;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(cronSecret);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
