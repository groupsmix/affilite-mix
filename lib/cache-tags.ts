/**
 * Canonical cache tag names for `revalidateTag()` / `fetch({ next: { tags } })`.
 *
 * Tags are **always** namespaced by the site's database UUID so that a write
 * on site A does not invalidate caches on site B. Previously every admin
 * mutation fired the global tags `"content"`, `"products"`, `"categories"`,
 * causing cross-site cache thrash.
 *
 * Usage:
 *   // Invalidate after a write to site X
 *   revalidateTag(contentTag(dbSiteId));
 *
 *   // Attach tags to cached reads
 *   fetch(url, { next: { tags: [contentTag(dbSiteId)] } });
 */

export const CONTENT_TAGS = ["content", "products", "categories"] as const;
export type ContentTag = (typeof CONTENT_TAGS)[number];

export function contentTag(siteId: string): string {
  return `content:${siteId}`;
}

export function productsTag(siteId: string): string {
  return `products:${siteId}`;
}

export function categoriesTag(siteId: string): string {
  return `categories:${siteId}`;
}

/** All site-scoped tags a single site uses. */
export function allSiteTags(siteId: string): string[] {
  return [contentTag(siteId), productsTag(siteId), categoriesTag(siteId)];
}

/** Tag-name helper keyed by the generic tag kind. */
export function siteTag(kind: ContentTag, siteId: string): string {
  return `${kind}:${siteId}`;
}
