/**
 * Extract the client IP address from request headers.
 * Prioritizes Cloudflare's cf-connecting-ip, then x-forwarded-for.
 * Returns "unknown" if no IP header is found.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
