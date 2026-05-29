/**
 * Shared HTML/URL/colour escapers for transactional email templates.
 *
 * T-08: Newsletter and password-reset emails interpolate site-controlled
 * fields (siteName, domain, accentColor) into HTML. A compromised admin
 * or DB-poisoning vector could otherwise smuggle script-y content into
 * the rendered message and turn a transactional email into a phishing
 * payload. Every text node and attribute interpolation MUST flow
 * through these helpers.
 */

/** Escape characters that have special meaning inside HTML text nodes and attributes. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strict alias used at attribute boundaries — same semantics as escapeHtml today. */
export function escapeAttribute(input: string): string {
  return escapeHtml(input);
}

/**
 * Validate a URL for use in `href` attributes.
 *
 * - Must parse as an absolute URL.
 * - Must use `http:` or `https:` (no `javascript:`, `data:`, `vbscript:`).
 * - Optional `allowedHostnames` lets callers further restrict the host
 *   (e.g. confirmation links must point at the tenant's own domain).
 *
 * Returns the canonicalised URL string or `null` when the input is unsafe.
 */
export function safeHref(input: string, allowedHostnames?: readonly string[]): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (allowedHostnames && allowedHostnames.length > 0) {
    const host = parsed.hostname.toLowerCase();
    const ok = allowedHostnames.some((allowed) => {
      const a = allowed.toLowerCase();
      return host === a || host.endsWith(`.${a}`);
    });
    if (!ok) return null;
  }
  return parsed.toString();
}

/**
 * Validate a CSS hex colour for use in inline `style` / `bgcolor` attributes.
 *
 * Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (case-insensitive). Anything
 * else (`expression(...)`, `url(...)`, `red; background:url(...)`, …) returns
 * the supplied fallback so attackers cannot break out of the style attribute.
 */
export function safeHexColor(input: string | undefined, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}
