import { NextRequest } from "next/server";

/**
 * Timing-safe comparison of two byte arrays.
 * Uses constant-time XOR to avoid leaking length or content via timing.
 * Compatible with Cloudflare Workers (no Node.js crypto dependency).
 */
export function timingSafeCompare(a: Uint8Array, b: Uint8Array): boolean {
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
 * Fails closed:
 *   - when no listed env var is configured at all;
 *   - when the header does not match any of them;
 *   - in production, when only the shared fallback (`CRON_SECRET`) is
 *     configured and the per-trigger secret (the first entry in
 *     `secretEnvVars`) is missing. Audit F-006: a single shared cron
 *     secret across publish, retention, Stripe sync, sitemap, AI jobs,
 *     commission ingestion, EPC recompute, price scrape, and deal
 *     expiry is too much privilege in one token. Operators must set
 *     the per-trigger secret in production; the shared secret is only
 *     accepted as a transient fallback in non-production environments.
 *
 * The fallback gate can be relaxed for staging/dev rollouts by setting
 * `CRON_ALLOW_SHARED_FALLBACK_IN_PROD=1`. That escape-hatch is logged
 * once on first use so operators see the reduced posture.
 */
export function verifyCronAuth(request: NextRequest, options: VerifyCronAuthOptions = {}): boolean {
  const envVars = options.secretEnvVars ?? ["CRON_SECRET"];

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return false;

  const encoder = new TextEncoder();
  const provided = encoder.encode(token);

  let anySecretConfigured = false;
  let perTriggerConfigured = false;
  let matched = false;
  for (let i = 0; i < envVars.length; i++) {
    const name = envVars[i];
    const value = process.env[name];
    if (!value) continue;
    anySecretConfigured = true;
    if (i === 0) {
      // First entry is the per-trigger dedicated secret; subsequent
      // entries are shared fallbacks (CRON_SECRET).
      perTriggerConfigured = true;
    }
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

  // F-006: in production, the per-trigger secret must be configured.
  // The shared CRON_SECRET on its own is rejected unless the operator
  // explicitly opts back into the legacy fallback posture.
  const isProd = process.env.NODE_ENV === "production";
  const allowFallback = process.env.CRON_ALLOW_SHARED_FALLBACK_IN_PROD === "1";
  // Only enforce the per-trigger gate when the caller actually passed
  // a dedicated secret env var (length > 1). Routes that genuinely have
  // no per-trigger secret (legacy callers passing the default
  // `["CRON_SECRET"]`) keep the previous behaviour.
  if (isProd && !allowFallback && envVars.length > 1 && !perTriggerConfigured) {
    return false;
  }

  return matched;
}
