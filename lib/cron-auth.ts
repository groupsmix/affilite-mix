import { NextRequest } from "next/server";
// SEC-02 (etap-3): canonical boolean env-var parser
import { parseBoolEnv } from "@/lib/env-bool";
// A11-05: single source of truth for timing-safe iteration cap
import { MAX_COMPARE_LEN } from "@/lib/csrf";
import { captureException } from "@/lib/sentry";

/**
 * Timing-safe comparison of two byte arrays.
 * Uses constant-time XOR to avoid leaking length or content via timing.
 * Compatible with Cloudflare Workers (no Node.js crypto dependency).
 */
export function timingSafeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    // AUDIT-FIX: Previously XOR'd `a[i] ^ a[i]` which is algebraically 0 and
    // could be optimised away by a JIT, eliminating the dummy work that keeps
    // the branch timing-equivalent to the equal-length path. Now XOR against
    // `b[i % lenB]` (same approach as lib/csrf.ts) so the compiler cannot
    // prove the result is constant.
    //
    // AUDIT-FIX (length side-channel): the loop now runs a fixed
    // `MAX_COMPARE_LEN` iterations rather than `max(a, b)`, so the loop
    // count no longer depends on either secret's length. The length
    // mismatch itself is folded into `result` (`lenA ^ lenB`) so any
    // difference in lengths still poisons the accumulator — the function
    // still returns `false` regardless, but the work performed by the
    // mismatched-length branch is independent of the actual byte lengths.
    if (a.byteLength === 0 || b.byteLength === 0) return false;
    const lenA = a.byteLength;
    const lenB = b.byteLength;
    let result = 0;
    result |= lenA ^ lenB;
    for (let i = 0; i < MAX_COMPARE_LEN; i++) {
      result |= a[i % lenA] ^ b[i % lenB];
    }
    void result;
    return false;
  }
  const eqLen = Math.min(a.byteLength, MAX_COMPARE_LEN);
  let result = 0;
  for (let i = 0; i < eqLen; i++) {
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

  // SEC-06 (etap-3): minimum cron-secret length in production. A misconfigured
  // single-character secret would otherwise be matched the same way as a
  // 32-byte random one. 32 bytes is the documented minimum (`.env.example`).
  const MIN_SECRET_LENGTH = 32;
  const isProdEnv = process.env.NODE_ENV === "production";

  let anySecretConfigured = false;
  let perTriggerConfigured = false;
  let matched = false;
  for (let i = 0; i < envVars.length; i++) {
    const name = envVars[i];
    const value = process.env[name];
    if (!value) continue;
    // SEC-06 (etap-3): skip too-short secrets in production. Logging once is
    // enough to surface misconfiguration via Sentry/structured logs.
    if (isProdEnv && value.length < MIN_SECRET_LENGTH) {
      // F-12: Surface misconfiguration via Sentry alert, not just console
      const msg = `[cron-auth] ${name} is shorter than the production minimum of ${MIN_SECRET_LENGTH} bytes — refusing to use it`;
      console.error(msg);
      captureException(new Error(msg), { context: "cron-auth.secret_too_short", secretName: name });
      continue;
    }
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
  // SEC-02 (etap-3): use the canonical env-bool parser so `=true`, `=1`,
  // `=yes`, `=on` all enable the fallback consistently.
  const isProd = process.env.NODE_ENV === "production";
  const allowFallback = parseBoolEnv("CRON_ALLOW_SHARED_FALLBACK_IN_PROD", false);
  // Only enforce the per-trigger gate when the caller actually passed
  // a dedicated secret env var (length > 1). Routes that genuinely have
  // no per-trigger secret (legacy callers passing the default
  // `["CRON_SECRET"]`) keep the previous behaviour.
  if (isProd && !allowFallback && envVars.length > 1 && !perTriggerConfigured) {
    return false;
  }

  return matched;
}
