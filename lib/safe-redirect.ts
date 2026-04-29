/**
 * G-46: Safe redirect helper — prevents open-redirect attacks.
 *
 * Any code that redirects to a URL derived from user input (query params,
 * form fields, headers) MUST use `safeRedirectUrl()` to validate the
 * destination against an allow-list of known-safe origins.
 *
 * Usage:
 *   const target = safeRedirectUrl(searchParams.get("next"), request);
 *   return NextResponse.redirect(target);
 */

/**
 * Validate a redirect target URL. Returns the validated absolute URL string,
 * or falls back to `fallback` (default: "/") when the target is missing,
 * malformed, or points to a disallowed origin.
 *
 * Allowed destinations:
 *   1. Relative paths (e.g. "/admin/content") — always safe.
 *   2. Same-origin absolute URLs — always safe.
 *   3. URLs whose origin appears in the optional `allowedOrigins` set.
 *
 * Everything else (javascript:, data:, external hosts) is rejected.
 */
export function safeRedirectUrl(
  target: string | null | undefined,
  request: Request,
  options: {
    fallback?: string;
    allowedOrigins?: ReadonlySet<string>;
  } = {},
): string {
  const { fallback = "/", allowedOrigins } = options;

  if (!target || typeof target !== "string") return fallback;

  // Trim whitespace and reject empty strings
  const trimmed = target.trim();
  if (!trimmed) return fallback;

  // Block protocol-relative URLs (//evil.com) and dangerous schemes
  if (/^[a-z]+:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return fallback;
  }

  // Relative paths are always safe
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  // Parse absolute URLs
  let parsed: URL;
  try {
    parsed = new URL(trimmed, request.url);
  } catch {
    return fallback;
  }

  // Reject non-HTTP(S) schemes (belt-and-suspenders)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return fallback;
  }

  // Same-origin is always allowed
  const requestOrigin = new URL(request.url).origin;
  if (parsed.origin === requestOrigin) {
    return parsed.pathname + parsed.search + parsed.hash;
  }

  // Check explicit allow-list
  if (allowedOrigins?.has(parsed.origin)) {
    return parsed.href;
  }

  // Everything else is rejected
  return fallback;
}
