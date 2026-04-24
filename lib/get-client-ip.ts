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
 *      Cloudflare).
 *   2. First entry of `x-forwarded-for`, but ONLY when
 *      `TRUST_PROXY_HEADERS=true` is set.
 *   3. Otherwise `"unknown"`.
 */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return truncateIp(cfIp);

  if (isProxyHeaderTrusted()) {
    const xff = request.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return truncateIp(first);
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
 * Truncate IP addresses for GDPR compliance (PII minimization).
 * IPv4: zeroes the last octet (e.g. 192.168.1.1 -> 192.168.1.0)
 * IPv6: keeps the first 48 bits, zeroes the rest (e.g. 2001:db8:1::1 -> 2001:db8:1::)
 */
function truncateIp(ip: string): string {
  if (!ip || ip === "unknown" || ip.startsWith("cf-ray:")) return ip;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    return ip;
  }
  if (ip.includes(":")) {
    const segments = ip.split(":");
    const emptyIndex = segments.indexOf("");
    const out = [];
    for (let i = 0; i < 3; i++) {
      if (emptyIndex !== -1 && i >= emptyIndex) out.push("0");
      else out.push(segments[i] || "0");
    }
    return `${out[0]}:${out[1]}:${out[2]}::`;
  }
  return ip;
}
