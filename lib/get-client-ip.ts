/**
 * Extract the client IP address from request headers.
 *
 * Security: the raw `x-forwarded-for` header is spoofable by any client that
 * can talk directly to the origin, so we do NOT trust it by default. We only
 * honour it when the deployment has explicitly opted in via the
 * `TRUST_PROXY_HEADERS` environment variable — e.g. when the origin is known
 * to sit behind a trusted reverse proxy that overwrites XFF.
 *
 * Priority:
 *   1. `cf-connecting-ip` (set by Cloudflare and stripped/overwritten at the
 *      edge, so it is trustworthy when the origin is only reachable through
 *      Cloudflare). Deployments whose origin is reachable directly (not behind
 *      Cloudflare) can set `TRUST_CF_CONNECTING_IP=false` to stop honouring this
 *      client-spoofable header — see `isCfConnectingIpTrusted()`.
 *   2. First entry of `x-forwarded-for`, but ONLY when
 *      `TRUST_PROXY_HEADERS=true` is set.
 *   3. Otherwise `"unknown"`.
 */
// R10-01: Track whether the missing-header warning has fired this isolate
// to avoid flooding logs with one warning per request.
let _warnedMissingCfIp = false;

export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  // F8: `cf-connecting-ip` is only trustworthy when the origin is exclusively
  // reachable through Cloudflare (CF sets it at the edge and strips any
  // client-supplied value). If the origin is directly reachable (e.g. a
  // *.workers.dev URL or an origin not firewalled to Cloudflare IP ranges), a
  // client can spoof this header to poison another user's rate-limit bucket,
  // evade login throttling, or satisfy JWT IP-binding from any network. Such
  // deployments set `TRUST_CF_CONNECTING_IP=false` to ignore it. Defaults to
  // `true` to preserve the documented Cloudflare-only deployment model.
  if (cfIp && isCfConnectingIpTrusted()) return cfIp;

  if (isProxyHeaderTrusted()) {
    const xff = request.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first;
  }

  // R10-01: Warn once per isolate only when we actually fall back to the shared
  // "unknown" bucket in production — i.e. no cf-connecting-ip AND no trusted
  // XFF. Warning before the XFF check would misfire for valid proxy setups
  // where clients are correctly bucketed by x-forwarded-for.
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
 * F8: whether `cf-connecting-ip` should be trusted. Defaults to `true` because
 * the canonical deployment is Cloudflare-only (see docs/CLOUDFLARE.md), where CF
 * sets this header and strips client-supplied copies. Deployments whose origin
 * is directly reachable (not exclusively behind Cloudflare) MUST set
 * `TRUST_CF_CONNECTING_IP=false` so a client cannot spoof its source IP via this
 * header. Only the explicit strings `false` / `0` disable it; any other value
 * (or unset) keeps the safe Cloudflare default.
 */
function isCfConnectingIpTrusted(): boolean {
  const flag = process.env.TRUST_CF_CONNECTING_IP;
  // F8: default to false so non-Cloudflare origins are not vulnerable to
  // `cf-connecting-ip` spoofing. Cloudflare-fronted deployments must set
  // TRUST_CF_CONNECTING_IP=true explicitly.
  if (flag === undefined) return false;
  const normalized = flag.toLowerCase();
  return normalized === "true" || normalized === "1";
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
