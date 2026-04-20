/**
 * Site-scoped cache tag helpers.
 *
 * Next.js `revalidateTag` and `fetch({ next: { tags } })` use plain strings,
 * which means every site previously shared a single "content" / "products" /
 * "categories" tag. Any mutation on site A would invalidate ISR caches for
 * sites B/C/D — noisy neighbour behaviour at best, a cross-site side-channel
 * at worst.
 *
 * These helpers namespace every tag under the site's slug so each site has
 * its own invalidation domain.
 *
 * A site slug is used (not the DB UUID) because tag names are also consumed
 * from public request contexts where only the slug is easily available.
 */

export type CacheTagKind = "content" | "products" | "categories";

const SEP = ":" as const;

/** Return the site-scoped tag for a given kind and site slug. */
export function siteTag(kind: CacheTagKind, siteSlug: string): string {
  if (!siteSlug) throw new Error("siteTag: siteSlug is required");
  return `site${SEP}${siteSlug}${SEP}${kind}`;
}

/** Shorthand helpers. */
export const contentTag = (siteSlug: string) => siteTag("content", siteSlug);
export const productsTag = (siteSlug: string) => siteTag("products", siteSlug);
export const categoriesTag = (siteSlug: string) => siteTag("categories", siteSlug);

/** Return all kinds of cache tags for a single site. */
export function allSiteTags(siteSlug: string): string[] {
  return [contentTag(siteSlug), productsTag(siteSlug), categoriesTag(siteSlug)];
}

/** Valid tag kinds — used when validating revalidation payloads. */
export const CACHE_TAG_KINDS: readonly CacheTagKind[] = [
  "content",
  "products",
  "categories",
] as const;

export function isCacheTagKind(value: unknown): value is CacheTagKind {
  return typeof value === "string" && (CACHE_TAG_KINDS as readonly string[]).includes(value);
}
