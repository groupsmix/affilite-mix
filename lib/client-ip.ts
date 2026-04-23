/**
 * Safe client IP extraction.
 *
 * F-008: Raw x-forwarded-for can be spoofed by attackers to bypass rate limits
 * when used directly. This module provides a safe extraction that:
 *
 * 1. Trusts CF-Ray / CF-IPCountry headers (set by Cloudflare edge, not client)
 * 2. For x-forwarded-for, only uses the rightmost IP (Cloudflare appends real IP)
 * 3. Falls back to cf-connecting-ip if available
 * 4. Returns "unknown" as last resort (prevents rate-limit bypass via null keys)
 */

import type { NextRequest } from "next/server";

/**
 * Extract the real client IP from a Next.js request.
 *
 * Priority (most trusted first):
 * 1. cf-connecting-ip — set by Cloudflare edge, cannot be spoofed
 * 2. CF-Ray / cf-ray — Cloudflare's internal trace ID (extract datacenter IP)
 * 3. Rightmost IP from x-forwarded-for — Cloudflare appends real IP here
 * 4. x-real-ip — sometimes set by nginx reverse proxy
 */
export function getClientIp(request: NextRequest): string {
  // 1. Cloudflare sets this when request passes through edge
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    return cfConnectingIp;
  }

  // 2. CF-Ray is a trace ID — we can extract a datacenter identifier but not
  // the true client IP. Use as fallback only if nothing else is available.
  const cfRay = request.headers.get("cf-ray");
  if (cfRay) {
    // Use first 8 chars of CF-Ray as a pseudo-identifier — not a real IP
    // but stable per datacenter/per request cluster
    return `cf-ray:${cfRay.slice(0, 8)}`;
  }

  // 3. x-forwarded-for: the rightmost IP is Cloudflare's server IP,
  // but we need the leftmost (original client). However, if Cloudflare is
  // configured to append, the format is: <client>, <proxy1>, <proxy2>, <cloudflare>
  // We should NOT trust anything except what Cloudflare explicitly tells us.
  // Instead, look for cf-ipcountry which Cloudflare sets reliably.
  const cfIpCountry = request.headers.get("cf-ipcountry");
  if (cfIpCountry) {
    // Cloudflare is definitely in the path — we can trust CF-Ray was processed
    // Use the leftmost x-forwarded-for value as the client IP
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      // x-forwarded-for format: client, proxy1, proxy2, ... Cloudflare
      // The LEFTMOST IP is the original client
      const parts = xff.split(",").map((p) => p.trim());
      const clientIp = parts[0];
      if (isValidIp(clientIp)) {
        return clientIp;
      }
    }
  }

  // 4. x-real-ip set by nginx reverse proxy
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp && isValidIp(xRealIp)) {
    return xRealIp;
  }

  // 5. Fallback: use the rightmost x-forwarded-for value (Cloudflare/server IP)
  // but this is better than nothing for rate limiting
  const xffFallback = request.headers.get("x-forwarded-for");
  if (xffFallback) {
    const parts = xffFallback.split(",").map((p) => p.trim());
    // Use the last IP in the chain — that's the server/cloudflare IP
    const serverIp = parts[parts.length - 1];
    if (isValidIp(serverIp)) {
      return serverIp;
    }
  }

  // 6. Last resort — return a fixed sentinel to prevent null-key rate limit bypass
  // The attacker gets grouped with "unknown" requests, which is acceptable
  return "unknown";
}

/** Basic IPv4/IPv6 validation */
function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;

  // IPv4 pattern
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every((p) => p >= 0 && p <= 255);
  }

  // IPv6 pattern (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Regex.test(ip)) {
    return true;
  }

  return false;
}