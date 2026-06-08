/**
 * F-007: Hostname utilities extracted from middleware.ts so they can be unit
 * tested in isolation and shared between the request entrypoint and the
 * site-resolution module without a circular dependency.
 */
import { NextRequest, NextResponse } from "next/server";

/**
 * A98-52: Canonicalize a hostname for use as a cache key.
 * - Lowercases (DNS is case-insensitive)
 * - Removes trailing dot (FQDN form → canonical)
 * - Strips port number
 *
 * This prevents cache fragmentation from equivalent hostnames
 * like "Example.COM", "example.com.", and "example.com:443".
 */
export function canonicalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * SECURITY-FIX (T1-001, T1-003 / CWE-1321, CWE-22): Validate a canonicalized
 * hostname before it is used to build KV cache keys or DB lookups. Rejects
 * prototype-pollution / path-traversal payloads and over-length names; only a
 * plain DNS hostname (<= 253 chars) is accepted.
 */
export function isValidHostname(hostname: string): boolean {
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(hostname) && hostname.length <= 253;
}

/**
 * Returns a rewrite to the tenant-aware 404 page.
 * The app's not-found.tsx will render with proper branding and localization.
 */
export function nicheNotFoundResponse(request: NextRequest): NextResponse {
  // Rewrite to the app's not-found page instead of returning inline HTML
  // This ensures tenant branding, localization, and proper SEO
  const url = request.nextUrl.clone();
  url.pathname = "/not-found";
  return NextResponse.rewrite(url, { status: 404 });
}
