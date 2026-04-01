import { NextRequest } from "next/server";

/**
 * Timing-safe comparison of two byte arrays.
 * Uses constant-time XOR to avoid leaking length or content via timing.
 * Compatible with Cloudflare Workers (no Node.js crypto dependency).
 */
function timingSafeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    // Compare a with itself to keep constant-time behavior
    let result = 0;
    for (let i = 0; i < a.byteLength; i++) {
      result |= a[i] ^ a[i];
    }
    void result;
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.byteLength; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

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
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(cronSecret);
  return timingSafeCompare(a, b);
}
