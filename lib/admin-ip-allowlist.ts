/**
 * Optional admin IP allow-list (defence-in-depth for the admin surface).
 *
 * The admin UI lives at an obfuscated, non-function-hinting segment
 * (`/q7m-k4j9/*`) and the admin API at `/api/admin/*`. Path obfuscation is
 * only defence-in-depth — the segment ships in the client bundle and can be
 * discovered. This module adds an *optional* network-layer gate on top of the
 * existing JWT/RBAC admin guard (`lib/admin-guard.ts`): when
 * `ADMIN_IP_ALLOWLIST` is configured, requests to the admin surface from IPs
 * outside the allow-list are rejected *before* any DB/KV work, with a 404 that
 * does not confirm the admin path exists.
 *
 * Design guarantees:
 *   - DISABLED BY DEFAULT. When `ADMIN_IP_ALLOWLIST` is unset/empty the
 *     evaluator returns `null` for every request, so existing deployments and
 *     admin access are completely unaffected.
 *   - FAIL-SAFE on misconfiguration. If the variable is set but contains *no*
 *     parseable entries (e.g. a typo), enforcement is disabled and a loud
 *     warning is logged, rather than locking the operator out of their own
 *     admin. The JWT/RBAC guard still protects the surface in that case.
 *   - FAIL-CLOSED on an unresolvable client IP. When the allow-list is active
 *     and the client IP cannot be trusted/derived, the request is blocked.
 *   - No client oracle. Blocked requests get a bare 404 (no header or body
 *     that reveals the allow-list exists), preserving the obfuscation property.
 *
 * IP entries may be exact IPv4/IPv6 addresses or CIDR ranges
 * (e.g. `203.0.113.4`, `203.0.113.0/24`, `2001:db8::/32`).
 */
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/get-client-ip";
import { emitMetric } from "@/lib/metrics";
import { logger } from "@/lib/logger";

/** Admin UI segment (kept in sync with `app/q7m-k4j9/*`). */
export const ADMIN_UI_PATH_PREFIX = "/q7m-k4j9";
/** Admin API segment guarded by `lib/admin-guard.ts` (`app/api/admin/*`). */
export const ADMIN_API_PATH_PREFIX = "/api/admin";

/**
 * Whether a pathname targets the admin surface (UI or API). The boundary is
 * exact: `/q7m-k4j9x` and `/api/admins` do NOT match.
 */
export function isAdminPath(pathname: string): boolean {
  return (
    pathname === ADMIN_UI_PATH_PREFIX ||
    pathname.startsWith(`${ADMIN_UI_PATH_PREFIX}/`) ||
    pathname === ADMIN_API_PATH_PREFIX ||
    pathname.startsWith(`${ADMIN_API_PATH_PREFIX}/`)
  );
}

interface CidrEntry {
  version: 4 | 6;
  /** Network address with host bits masked to zero. */
  base: bigint;
  /** Prefix length in bits (0..32 for v4, 0..128 for v6). */
  prefix: number;
}

interface ParsedIp {
  version: 4 | 6;
  bits: bigint;
}

const IPV4_OCTET_RE = /^\d{1,3}$/;
const IPV6_GROUP_RE = /^[0-9a-fA-F]{1,4}$/;
const PREFIX_RE = /^\d{1,3}$/;

function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const part of parts) {
    if (!IPV4_OCTET_RE.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    n = (n << 8n) | BigInt(value);
  }
  return n;
}

function ipv6ToBigInt(input: string): bigint | null {
  // Strip an optional zone id (e.g. fe80::1%eth0) before parsing.
  const ip = input.includes("%") ? input.slice(0, input.indexOf("%")) : input;
  if (!ip.includes(":")) return null;

  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;

  let groups: string[];
  if (tail === null) {
    // No "::" compression — must be a full 8-group address.
    groups = head;
    if (groups.length !== 8) return null;
  } else {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;

  let n = 0n;
  for (const group of groups) {
    if (!IPV6_GROUP_RE.test(group)) return null;
    n = (n << 16n) | BigInt(parseInt(group, 16));
  }
  return n;
}

/** Parse a bare IP literal (IPv4 or IPv6) to its integer form. */
export function parseIp(ip: string): ParsedIp | null {
  const trimmed = ip.trim();
  if (!trimmed) return null;
  // IPv4 has dots and no colons; anything with a colon is treated as IPv6.
  if (trimmed.includes(":")) {
    const bits = ipv6ToBigInt(trimmed);
    return bits === null ? null : { version: 6, bits };
  }
  if (trimmed.includes(".")) {
    const bits = ipv4ToBigInt(trimmed);
    return bits === null ? null : { version: 4, bits };
  }
  return null;
}

/** Parse a single allow-list entry — an exact IP or a CIDR range. */
function parseEntry(entry: string): CidrEntry | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const slash = trimmed.indexOf("/");
  const ipPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const prefixPart = slash === -1 ? null : trimmed.slice(slash + 1);

  const parsed = parseIp(ipPart);
  if (!parsed) return null;

  const maxBits = parsed.version === 4 ? 32 : 128;
  let prefix: number;
  if (prefixPart === null) {
    prefix = maxBits; // exact address == /32 or /128
  } else {
    if (!PREFIX_RE.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix > maxBits) return null;
  }

  const hostBits = BigInt(maxBits - prefix);
  const base = hostBits === 0n ? parsed.bits : (parsed.bits >> hostBits) << hostBits;
  return { version: parsed.version, base, prefix };
}

function ipMatchesEntry(ip: ParsedIp, entry: CidrEntry): boolean {
  if (entry.version !== ip.version) return false;
  const maxBits = ip.version === 4 ? 32 : 128;
  const hostBits = BigInt(maxBits - entry.prefix);
  if (hostBits === 0n) return ip.bits === entry.base;
  return ip.bits >> hostBits === entry.base >> hostBits;
}

// Parse-once cache keyed on the raw env value. Admin traffic is low volume, but
// re-parsing CIDR entries on every request is needless work; the cache also
// makes the "warn on invalid entries" side effect fire once per config value.
let cachedRaw: string | null = null;
let cachedEntries: CidrEntry[] = [];

function getParsedAllowlist(): CidrEntry[] {
  const raw = (process.env.ADMIN_IP_ALLOWLIST ?? "").trim();
  if (raw === "") {
    cachedRaw = "";
    cachedEntries = [];
    return cachedEntries;
  }
  if (raw === cachedRaw) return cachedEntries;

  cachedRaw = raw;
  const rawParts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const entries: CidrEntry[] = [];
  const invalid: string[] = [];
  for (const part of rawParts) {
    const parsed = parseEntry(part);
    if (parsed) entries.push(parsed);
    else invalid.push(part);
  }
  cachedEntries = entries;

  if (invalid.length > 0) {
    logger.warn("ADMIN_IP_ALLOWLIST contains unparseable entries — they are ignored", {
      invalid_count: invalid.length,
      valid_count: entries.length,
    });
  }
  if (entries.length === 0) {
    // Fail-safe: a set-but-empty allow-list is almost certainly a typo.
    // Disable enforcement rather than lock the operator out of admin; the
    // JWT/RBAC guard still protects the surface.
    logger.error(
      "ADMIN_IP_ALLOWLIST is set but has no valid entries — admin IP gating is DISABLED (fail-safe). Fix the value to re-enable network-layer admin protection.",
    );
  }

  return cachedEntries;
}

function blockedResponse(): NextResponse {
  // 404 (not 403): do not confirm to a non-allow-listed client that the admin
  // surface exists here. Mirrors the minimal-oracle discipline of the retired
  // /admin 410 handler.
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * Evaluate the admin IP allow-list for a request.
 *
 * @returns a 404 `NextResponse` when the request targets the admin surface and
 *   must be blocked; otherwise `null` (feature disabled, non-admin path, or the
 *   client IP is allow-listed) so the caller continues the pipeline.
 */
export function enforceAdminIpAllowlist(request: Request): NextResponse | null {
  const entries = getParsedAllowlist();
  // Disabled (unset/empty) or misconfigured (set-but-no-valid-entries) →
  // never block. Both cases leave the JWT/RBAC guard as the control.
  if (entries.length === 0) return null;

  const pathname = new URL(request.url).pathname;
  if (!isAdminPath(pathname)) return null;

  const clientIp = getClientIp(request);
  if (clientIp !== "unknown") {
    const parsed = parseIp(clientIp);
    if (parsed && entries.some((entry) => ipMatchesEntry(parsed, entry))) {
      return null; // allow-listed — continue.
    }
  }

  // Not allow-listed, or the client IP could not be trusted/derived
  // (fail-closed). Emit a metric for alerting and block.
  emitMetric("admin_ip_blocked", 1);
  return blockedResponse();
}

/** Test-only: reset the parse cache between cases. */
export function __resetAdminIpAllowlistCacheForTests(): void {
  cachedRaw = null;
  cachedEntries = [];
}
