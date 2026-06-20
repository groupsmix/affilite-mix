/**
 * Canonical ordering for "X-vs-Y" comparison slugs (CA-302).
 *
 * A comparison between two tools can be written either way round
 * (`jasper-vs-writesonic` and `writesonic-vs-jasper`). Left unchecked that is
 * two URLs for one page — duplicate content that splits ranking signals and
 * wastes crawl budget. We define the *canonical* form as the alphabetically
 * ordered one (operand A < operand B) and 301 the reverse to it.
 *
 * These helpers are pure and runtime-agnostic — they are used in the edge
 * middleware, the sitemap, and the admin write path — so they must not import
 * anything environment-specific.
 */

/** The separator token between the two operands of a comparison slug. */
const VS_SEPARATOR = "-vs-";

/** The public route segment under which comparison pages are served. */
const COMPARISON_PREFIX = "/comparison/";

/**
 * Split a slug into its two comparison operands, or return null when the slug
 * is not a two-operand comparison.
 *
 * Rules:
 *  - There must be exactly one `-vs-` separator. Zero means it isn't a
 *    comparison; two or more is a multi-tool compare (CA-304), which has its
 *    own canonical handling and is intentionally left untouched here.
 *  - Both operands must be non-empty (`-vs-foo` / `foo-vs-` are rejected).
 *
 * Operands may themselves contain hyphens (e.g. `jasper-vs-copy-ai` →
 * `jasper` / `copy-ai`) because the split is on the `-vs-` token, not on `-`.
 */
export function parseVsSlug(slug: string): { left: string; right: string } | null {
  const parts = slug.split(VS_SEPARATOR);
  if (parts.length !== 2) return null;
  const [left, right] = parts;
  if (!left || !right) return null;
  return { left, right };
}

/** True when `slug` is a well-formed two-operand comparison slug. */
export function isVsSlug(slug: string): boolean {
  return parseVsSlug(slug) !== null;
}

/**
 * Return the canonical (alphabetically ordered) form of a comparison slug.
 * Non-comparison slugs are returned unchanged, so this is safe to call
 * unconditionally on any content slug.
 *
 * Ordering uses a plain codepoint comparison (not locale-aware) so the result
 * is identical across the edge runtime, Node, and Postgres (`COLLATE "C"`).
 */
export function canonicalizeVsSlug(slug: string): string {
  const parsed = parseVsSlug(slug);
  if (!parsed) return slug;
  const { left, right } = parsed;
  // `<=` keeps already-ordered and identical-operand slugs untouched.
  if (left <= right) return slug;
  return `${right}${VS_SEPARATOR}${left}`;
}

/** True when the slug is a comparison slug that is NOT already canonical. */
export function isNonCanonicalVsSlug(slug: string): boolean {
  return canonicalizeVsSlug(slug) !== slug;
}

/**
 * Given a request pathname, return the canonical pathname when it points to a
 * non-canonical comparison slug, or null when no redirect is needed.
 *
 * Only the `/comparison/<slug>` route is considered, and only a single,
 * unencoded path segment — nested paths and percent-encoded slugs are left for
 * the normal routing/404 path to handle.
 */
export function canonicalComparisonPath(pathname: string): string | null {
  if (!pathname.startsWith(COMPARISON_PREFIX)) return null;
  const slug = pathname.slice(COMPARISON_PREFIX.length);
  if (!slug || slug.includes("/") || slug.includes("%")) return null;
  const canonical = canonicalizeVsSlug(slug);
  if (canonical === slug) return null;
  return COMPARISON_PREFIX + canonical;
}
