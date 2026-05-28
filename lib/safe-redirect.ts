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

  // Q1-2: Strip ASCII C0 control chars (0x00-0x1F), DEL (0x7F), and Unicode
  // whitespace (U+00A0, U+1680, U+180E, U+2000-U+200A, U+2028, U+2029,
  // U+202F, U+205F, U+3000, U+FEFF) before any validation. This closes the
  // divergence where trim() removes some chars but the URL parser or regex
  // sees a different scheme due to residual control/space bytes.
  const stripped = target.replace(
    /[\x00-\x1f\x7f\u00A0\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g,
    "",
  );
  const trimmed = stripped.trim();
  if (!trimmed) return fallback;

  // SEC-01 (etap-3): Normalise backslashes to forward slashes before any
  // further processing. The WHATWG URL parser treats `\` as `/` in HTTP(S)
  // URLs, so an input like `/\evil.com` parses as `https://evil.com/`.
  // Earlier revisions of this helper short-circuited on
  // `trimmed.startsWith("/") && !trimmed.startsWith("//")` and returned the
  // RAW input string — which then resolved to an off-site host once the
  // browser followed the Location header. Normalising the input first
  // collapses that bypass into the canonical same-origin / allow-list checks
  // below.
  const normalised = trimmed.replace(/\\/g, "/");

  // Reject protocol-relative authorities post-normalisation. The URL parser
  // handles `//host` correctly but we never want to return one to the caller.
  if (normalised.startsWith("//")) {
    return fallback;
  }

  // Q1-2: Parse via URL first, then validate the parsed protocol. This is
  // the canonical check — the regex pre-check is belt-and-suspenders.
  // Protocol-relative URLs (//evil.com) are caught by the URL parser.
  let parsed: URL;
  try {
    parsed = new URL(normalised, request.url);
  } catch {
    return fallback;
  }

  // Reject non-HTTP(S) schemes (catches javascript:, data:, etc.)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return fallback;
  }

  // SEC-01 (etap-3): Always derive the returned URL from `parsed` rather
  // than echoing the (possibly attacker-controlled) raw input string. The
  // previous "relative path is always safe" branch returned the raw input,
  // which masked the WHATWG backslash-as-slash behaviour. Collapsing the
  // relative-path case into the same-origin check makes the trust boundary
  // unambiguous: the return value is always derived from a parsed URL whose
  // origin we have just verified.
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
