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

function ipFingerprint(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";

  // IPv4: keep the first three octets (/24) and zero the last.
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  }

  // IPv6: keep the routing prefix (/48) — first three 16-bit groups.
  // Node's URL-style addresses may include brackets; strip them.
  const normalized = ip.replace(/^\[|\]$/g, "");
  const segments = normalized.split(":").filter((s) => s.length > 0);
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
export async function computeRequestBinding(request: Request): Promise<string | null> {
  const ua = (request.headers.get(USER_AGENT_HEADER) ?? "").trim();
  const ip = ipFingerprint(getClientIp(request));

  if (!ua && ip === "unknown") return null;

  return sha256Hex(`${ua}|${ip}`);
}

/**
 * Check a token's binding claim against the current request.
 *
 * Returns `true` when:
 *  - the token carries no binding claim (legacy tokens or refresh-issued
 *    tokens without a request), or
 *  - the claim matches the request's computed binding.
 *
 * Returns `false` only when a binding claim is present and differs from
 * the current request — i.e. the token is being replayed from a different
 * device or network.
 */
export async function verifyRequestBinding(
  tokenBinding: string | undefined,
  request: Request | undefined,
): Promise<boolean> {
  if (!tokenBinding) return true;
  if (!request) return true;

  const expected = await computeRequestBinding(request);
  if (expected === null) return true;

  return expected === tokenBinding;
}
