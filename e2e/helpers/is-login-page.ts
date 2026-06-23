const LOGIN_SEGMENT = "/q7m-k4j9/login"; // case-sensitive Obfuscated_Admin_Path segment

/**
 * Pure predicate that detects the obfuscated admin login page from a URL string.
 *
 * Returns `true` only when the case-sensitive substring `/q7m-k4j9/login` is
 * present. Returns `false` for any string lacking the segment (including
 * `/admin/login`), and for `null`, `undefined`, the empty string, or any
 * non-string input, without throwing.
 */
export function isLoginPage(url: unknown): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  return url.includes(LOGIN_SEGMENT);
}
