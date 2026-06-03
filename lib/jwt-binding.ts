/**
 * F-035: JWT user-agent / IP binding.
 *
 * Adds an optional "bnd" (binding) claim to admin JWTs containing a hash of
 * the requesting client's user-agent and IP /24 at issuance. When the token
 * is later verified alongside a request we recompute the hash and reject
 * mismatches — a stolen token replayed from a different device or network
 * will fail verification.
 *
 * Scope: enforced for the 24h life of the token (matches EXPIRY in
 * lib/auth.ts). IP matching is relaxed to the /24 prefix to tolerate mobile
 * NAT shifts; user-agent is compared exactly. The binding is OPTIONAL — if
 * the request context cannot be derived at issuance we simply don't include
 * the claim, preserving backwards compatibility with refresh flows that
 * don't have access to headers.
 */

import { getClientIp } from "@/lib/get-client-ip";

const USER_AGENT_HEADER = "user-agent";

/**
 * G-16: role-aware IP fingerprinting.
 *
 * - `super_admin`: exact IP (/32 for IPv4, /128 for IPv6) — tightest
 *   possible binding for the most privileged role.
 * - All other roles: /24 for IPv4, /48 for IPv6 — tolerates NAT shifts
 *   while still detecting cross-network replay.
 */
function ipFingerprint(ip: string, role?: string): string {
  if (!ip || ip === "unknown") return "unknown";

  const strict = role === "super_admin";

  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    if (strict) return `${v4[1]}.${v4[2]}.${v4[3]}.${v4[4]}/32`;
    return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  }

  // IPv6: keep the routing prefix (/48 or full /128 for super_admin).
  // Node's URL-style addresses may include brackets; strip them.
  const normalized = ip.replace(/^\[|\]$/g, "");
  const segments = normalized.split(":").filter((s) => s.length > 0);
  if (strict) return normalized + "/128";
  if (segments.length >= 3) {
    return `${segments[0]}:${segments[1]}:${segments[2]}::/48`;
  }

  return normalized;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the binding hash for a request. Returns null when no usable
 * fingerprint material is available (missing UA + unknown IP) — callers
 * should not include a binding claim in that case.
 */
export async function computeRequestBinding(
  request: Request,
  role?: string,
): Promise<string | null> {
  const ua = (request.headers.get(USER_AGENT_HEADER) ?? "").trim();
  const ip = ipFingerprint(getClientIp(request), role);

  if (!ua && ip === "unknown") return null;

  return sha256Hex(`${ua}|${ip}`);
}

/**
 * Check a token's binding claim against the current request.
 *
 * F-AUTH-02: Returns `false` when the token has no `bnd` claim and the route
 * demands binding (requireBinding=true). Legacy tokens without binding are
 * rejected when binding is required. When requireBinding is false (default),
 * missing binding is accepted for backwards compatibility.
 *
 * Returns `false` when a binding claim is present and differs from
 * the current request — i.e. the token is being replayed from a different
 * device or network.
 *
 * P0-BIND: When the token has a binding claim but the current request
 * produces no fingerprint material (no UA and unknown IP), the function
 * fails **closed** in production (`requireBinding=true`). A previous
 * revision returned `true` in this case, which allowed a stolen token
 * to be replayed by any client that stripped its UA and arrived without
 * a trusted source IP (e.g. any path that bypasses the Cloudflare edge
 * and therefore lacks `cf-connecting-ip`). The binding check is
 * defense-in-depth, so we must not silently pass it through when we
 * cannot compare.
 */
export async function verifyRequestBinding(
  tokenBinding: string | undefined,
  request: Request | undefined,
  requireBinding: boolean = false,
  role?: string,
): Promise<boolean> {
  if (!tokenBinding) {
    return !requireBinding;
  }
  if (!request) return !requireBinding;

  const expected = await computeRequestBinding(request, role);
  if (expected === null) {
    // Token carries a binding but we cannot recompute one from the current
    // request. Treat this the same as a hard mismatch when binding is
    // required; in legacy/dev mode (requireBinding=false), preserve the
    // previous lenient behaviour so background flows that genuinely have
    // no fingerprint material keep working.
    return !requireBinding;
  }

  // S0-FP-009: use timing-safe comparison instead of === to prevent
  // theoretical character-by-character brute-force of the binding hash.
  return timingSafeEqual(expected, tokenBinding);
}

/**
 * Timing-safe string equality for binding hashes.
 * Fixed-length SHA-256 hex strings (64 chars), so length mismatch
 * is itself a hard reject without timing information.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
