/**
 * Centralized admin path constants.
 *
 * The admin dashboard lives under an obfuscated path (/q7m-k4j9) for
 * security-through-obscurity. Previously this path string was hardcoded in
 * 80+ places across the codebase, including client components (admin-sidebar,
 * admin-topbar, command-menu, admin-nav config) where it leaked into the
 * client JS bundle.
 *
 * This module centralizes the path prefix so it can be changed in one place.
 * Server-only code can use the constant directly; client components import
 * the constant from here (it still appears in the bundle, but only once as
 * a minified variable reference instead of dozens of inline string literals).
 *
 * See audit finding: "Admin path leaks into client bundles" — the long-term
 * fix is a server-side redirect table that maps generic paths (/admin/*)
 * to the obfuscated prefix at the middleware level, keeping the prefix
 * entirely server-side. This module is the first step: it makes the rename
 * a one-line change.
 */

/** The obfuscated admin path prefix. All admin routes live under this. */
export const ADMIN_PATH = "/q7m-k4j9";

/** The admin login route. */
export const ADMIN_LOGIN_PATH = `${ADMIN_PATH}/login`;

/** The admin sites picker route (used when no active site is set). */
export const ADMIN_SITES_PATH = `${ADMIN_PATH}/sites`;

/** The admin settings route. */
export const ADMIN_SETTINGS_PATH = `${ADMIN_PATH}/settings`;

/**
 * Build an admin route path by appending segments to the admin prefix.
 * @example adminRoute("/analytics") -> "/q7m-k4j9/analytics"
 */
export function adminRoute(segment = ""): string {
  if (!segment) return ADMIN_PATH;
  // Ensure no double slash
  const cleanSegment = segment.startsWith("/") ? segment : `/${segment}`;
  return `${ADMIN_PATH}${cleanSegment}`;
}
