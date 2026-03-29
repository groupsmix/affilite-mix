import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Verify cron job authentication via Authorization header.
 * Expects: Authorization: Bearer <CRON_SECRET>
 *
 * Fails closed: rejects all requests when CRON_SECRET is not configured.
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed — CRON_SECRET must always be configured
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(cronSecret);
  if (a.byteLength !== b.byteLength) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
