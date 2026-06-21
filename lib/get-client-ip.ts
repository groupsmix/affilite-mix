/**
 * Extract the client IP address from request headers.
 *
 * Security: both `cf-connecting-ip` and `x-forwarded-for` are spoofable by
 * any client that can talk directly to the origin. We only honour them when
 * the deployment has explicitly opted in via `TRUST_PROXY_HEADERS=true` —
 * i.e. when the origin is only reachable through a trusted proxy/CDN that
 * overwrites these headers before they reach us.
 *
 * T1-F8: previously `cf-connecting-ip` was returned unconditionally (before
 * the TRUST_PROXY_HEADERS gate), which made it spoofable on any non-Cloudflare
 * path (e.g. *.workers.dev or if the origin IP were reachable directly). Both
 * headers now require TRUST_PROXY_HEADERS=true.
 *
 * Priority (when TRUST_PROXY_HEADERS=true):
 *   1. `cf-connecting-ip` — Cloudflare overwrites this at the edge so it
 *      is the real client IP for any traffic that flows through Cloudflare.
 *   2. First entry of `x-forwarded-for`.
 *   3. Otherwise `"unknown"`.
 *
 * Deployment note: always set TRUST_PROXY_HEADERS=true in Cloudflare Workers
 * and any deployment that sits exclusively behind a trusted reverse proxy.
 * Without this flag all IP-based rate-limit keys collapse to the shared
 * "unknown" bucket.
 */
// R10-01: Track whether the missing-header warning has fired this isolate
// to avoid flooding logs with one warning per request.
let _warnedMissingCfIp = false;

export function getClientIp(request: Request): string {
  if (isProxyHeaderTrusted()) {
    const cfIp = request.headers.get("cf-connecting-ip");
    if (cfIp) return cfIp;

    const xff = request.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first;
  }

  // R10-01: Warn once per isolate only when we fall back to the shared
  // "unknown" bucket in production — i.e. no trusted header found.
  if (process.env.NODE_ENV === "production" && !_warnedMissingCfIp) {
    _warnedMissingCfIp = true;
    // Use console.warn to avoid import cycle with logger (which may import us).
    // eslint-disable-next-line no-console -- FR-06: logger imports this module; console avoids the cycle
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "cf-connecting-ip header missing in production — all clients share rate-limit bucket 'unknown'",
        metric: "missing_cf_connecting_ip",
      }),
    );
  }

  return "unknown";
}

/**
 * Whether the deployment has explicitly opted in to trusting the
 * `x-forwarded-for` header. Defaults to `false` so spoofed XFF values
 * from direct-to-origin clients are ignored.
 */
function isProxyHeaderTrusted(): boolean {
  const flag = process.env.TRUST_PROXY_HEADERS;
  if (!flag) return false;
  return flag.toLowerCase() === "true" || flag === "1";
}

/**
 * Resolve the first three IPv6 segments, expanding the optional `::`
 * zero-compression so that equivalent input forms produce the same
 * output. Returns three string segments (each lower-cased), or `null`
 * if the input is not a parseable IPv6 literal.
 *
 * Examples:
 *   "2001:db8::1"           -> ["2001","db8","0"]
 *   "2001:db8:0:0:0:0:0:1"  -> ["2001","db8","0"]
 *   "fe80::1"               -> ["fe80","0","0"]
 *   "::1"                   -> ["0","0","0"]
 */
function ipv6First3Segments(ip: string): [string, string, string] | null {
  // Reject IPv4-mapped or unbracketed garbage before splitting.
  if (!ip.includes(":")) return null;
  const segments = ip.toLowerCase().split(":");
  // Find the first occurrence of "" which corresponds to the `::`
  // compression. Two adjacent empty strings (e.g. "::1" -> ["", "", "1"])
  // collapse to a single compression point at the first index.
  const emptyIndex = segments.indexOf("");
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (emptyIndex !== -1 && i >= emptyIndex) {
      out.push("0");
    } else {
      out.push(segments[i] || "0");
    }
  }
  return [out[0]!, out[1]!, out[2]!];
}

/**
 * Truncate IP addresses for GDPR compliance (PII minimization).
 * IPv4: zeroes the last octet (e.g. 192.168.1.1 -> 192.168.1.0)
 * IPv6: keeps the first 48 bits, zeroes the rest (e.g. 2001:db8:1::1 -> 2001:db8:1::)
 */
export function truncateIp(ip: string): string {
  if (!ip || ip === "unknown" || ip.startsWith("cf-ray:")) return ip;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    return ip;
  }
  if (ip.includes(":")) {
    const out = ipv6First3Segments(ip);
    if (!out) return ip;
    return `${out[0]}:${out[1]}:${out[2]}::`;
  }
  return ip;
}

/**
 * Canonical /24 (IPv4) or /48 (IPv6) prefix suitable for use as a
 * stable identifier in KV / dedup keys. Unlike `truncateIp`, the IPv4
 * branch omits the trailing zero octet ("203.0.113" rather than
 * "203.0.113.0") to match historical analytics storage. The IPv6
 * branch always returns a canonical form so that equivalent
 * representations (e.g. "2001:db8::1" and "2001:db8:0:0:0:0:0:1") yield
 * the same prefix and therefore the same dedup key.
 *
 * Returns `null` for unrecognized inputs (including the literal
 * "unknown" sentinel returned by `getClientIp`).
 */
export function getIpPrefix(ip: string): string | null {
  if (!ip || ip === "unknown" || ip.startsWith("cf-ray:")) return null;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}`;
    return null;
  }
  if (ip.includes(":")) {
    const out = ipv6First3Segments(ip);
    if (!out) return null;
    return `${out[0]}:${out[1]}:${out[2]}::`;
  }
  return null;
}
