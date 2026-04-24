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

export interface VerifyCronAuthOptions {
  /**
   * Ordered list of env-var names to accept as a valid bearer secret.
   *
   * Defaults to `["CRON_SECRET"]` for backwards compatibility. Per-trigger
   * routes should pass a dedicated secret first and fall back to the
   * shared `CRON_SECRET` while operators roll out per-trigger secrets:
   *
   *   verifyCronAuth(request, {
   *     secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"],
   *   });
   *
   * Every entry is checked with a timing-safe comparison; the function
   * fails closed if none of the listed env vars are configured.
   */
  readonly secretEnvVars?: readonly string[];
}

/**
 * Verify cron job authentication via Authorization header.
 * Expects: Authorization: Bearer <secret>
 *
 * Fails closed: rejects all requests when none of the configured env
 * vars are set, or when the header does not match any of them.
 */
export function verifyCronAuth(request: NextRequest, options: VerifyCronAuthOptions = {}): boolean {
  const envVars = options.secretEnvVars ?? ["CRON_SECRET"];

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return false;

  const encoder = new TextEncoder();
  const provided = encoder.encode(token);

  let anySecretConfigured = false;
  let matched = false;
  for (const name of envVars) {
    const value = process.env[name];
    if (!value) continue;
    anySecretConfigured = true;
    const expected = encoder.encode(value);
    // Compare every configured secret so a match on a later entry still
    // counts even if an earlier one is set but differs. Do not short-circuit
    // inside the loop — that would leak which secret succeeded via timing.
    if (timingSafeCompare(provided, expected)) {
      matched = true;
    }
  }

  // Fail closed when no listed env var is configured at all.
  if (!anySecretConfigured) return false;

  return matched;
}
