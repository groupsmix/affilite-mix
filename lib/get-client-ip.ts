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
  if (cfIp) return cfIp;

  if (isProxyHeaderTrusted()) {
    const xff = request.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first;
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
