import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listPublishedPages } from "@/lib/dal/pages";
import { shouldSkipDbCall } from "@/lib/db-available";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";

const MAX_CONTENT_URLS = 45_000;

/**
 * KV key used to persist the last-good sitemap per site domain so the
 * route can fail-open when the DB is unavailable. We serialize dates
 * back to ISO strings when reading the cache, then revive them on
 * parse (MetadataRoute.Sitemap accepts ISO strings transparently).
 */
const LAST_GOOD_TTL_SECONDS = 24 * 60 * 60; // 24h

function lastGoodKey(siteDomain: string): string {
  return `sitemap:last-good:${siteDomain}`;
}

function getKv(): KVNamespace | null {
  try {
    const kv = (process.env as unknown as { APP_CACHE_KV?: KVNamespace }).APP_CACHE_KV;
    return kv ?? null;
  } catch {
    // fail-open: best-effort
    return null;
  }
}

async function readLastGoodSitemap(siteDomain: string): Promise<MetadataRoute.Sitemap | null> {
  const kv = getKv();
  if (!kv) return null;
  try {
    const raw = await kv.get(lastGoodKey(siteDomain), "text");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as MetadataRoute.Sitemap;
  } catch (err) {
    logger.warn("Sitemap: failed to read last-good cache", {
      domain: siteDomain,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function writeLastGoodSitemap(
  siteDomain: string,
  sitemap: MetadataRoute.Sitemap,
): Promise<void> {
  const kv = getKv();
  if (!kv) return;
  // Only cache non-trivial responses; caching an empty array would
  // defeat the fail-open guarantee on the next request.
  if (sitemap.length === 0) return;
  try {
    await kv.put(lastGoodKey(siteDomain), JSON.stringify(sitemap), {
      expirationTtl: LAST_GOOD_TTL_SECONDS,
    });
  } catch (err) {
    logger.warn("Sitemap: failed to write last-good cache", {
      domain: siteDomain,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Build a minimal "static-only" sitemap from the site config. Used as
 * the last-resort fallback when:
 *   1. Getting the site context succeeds but
 *   2. The DB is unavailable AND
 *   3. No last-good cache is present.
 * Even in that case we still return at least the static marketing
 * pages rather than an empty `<urlset>` — the audit (G-07) explicitly
 * forbids returning an empty sitemap because it tells search engines
 * every URL has been removed, which destroys organic traffic.
 */
/**
 * P2-2: Stable last-modified date for static pages. Using new Date() on every
 * request signals to search engines that pages changed when they did not,
 * wasting crawl budget and sending misleading freshness signals.
 */
const STATIC_LAST_MODIFIED = new Date("2026-04-01T00:00:00Z");

function staticFallback(site: {
  domain: string;
  seo: {
    sitemapStaticPages: Array<{
      path: string;
      changeFrequency: string;
      priority: number;
      lastModified?: string;
    }>;
  };
}): MetadataRoute.Sitemap {
  const baseUrl = `https://${site.domain}`;
  return site.seo.sitemapStaticPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: page.lastModified ? new Date(page.lastModified) : STATIC_LAST_MODIFIED,
    changeFrequency: page.changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: page.priority,
  }));
}

/**
 * G-07: sitemap fail-open.
 *
 * The previous implementation returned `[]` whenever `getCurrentSite()`
 * threw. Next.js serialises an empty sitemap array to
 * `<urlset xmlns="..."></urlset>` which search engines treat as a
 * deliberate "remove every URL" instruction. Under a sustained DB
 * outage that would deindex the site.
 *
 * The new behaviour:
 *   1. Try to build the full sitemap (static + dynamic entries).
 *      Cache the result in KV under `sitemap:last-good:<domain>`.
 *   2. If the dynamic fetch fails, return static pages + the last-
 *      good cached dynamic entries (if available). Never return [].
 *   3. If `getCurrentSite()` itself fails (no site context), throw so
 *      Next.js emits a 5xx instead of a soft-200 empty sitemap —
 *      Googlebot retries 5xx after a short delay; empty sitemaps are
 *      believed immediately.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let site: Awaited<ReturnType<typeof getCurrentSite>>;
  try {
    site = await getCurrentSite();
  } catch (err) {
    // G-07: never return an empty sitemap. Surface the failure as an
    // exception so Next.js serves a 5xx (retryable) instead of a
    // valid-but-empty `<urlset>` (deindex signal).
    logger.error("Sitemap: getCurrentSite() failed, forcing 5xx", {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { context: "sitemap.getCurrentSite" });
    throw err;
  }

  const baseUrl = `https://${site.domain}`;

  // P2-2: Use a stable date for static pages instead of new Date() on every
  // request, which would falsely signal to search engines that every static
  // page changed on every crawl.
  const staticEntries: MetadataRoute.Sitemap = site.seo.sitemapStaticPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: page.lastModified ? new Date(page.lastModified) : STATIC_LAST_MODIFIED,
    changeFrequency: page.changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: page.priority,
  }));

  let dynamicEntries: MetadataRoute.Sitemap = [];
  let dynamicFetchSucceeded = false;

  if (!shouldSkipDbCall()) {
    try {
      const [content, categories, pages] = await Promise.all([
        listPublishedContent(site.id, undefined, MAX_CONTENT_URLS),
        listCategories(site.id),
        listPublishedPages(site.id),
      ]);

      const contentEntries: MetadataRoute.Sitemap = content.map((item) => ({
        url: `${baseUrl}/${item.type}/${item.slug}`,
        lastModified: item.updated_at ? new Date(item.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

      const categoryEntries: MetadataRoute.Sitemap = categories.map((cat) => ({
        url: `${baseUrl}/category/${cat.slug}`,
        // P2-2: categories don't carry updated_at; use stable constant
        lastModified: STATIC_LAST_MODIFIED,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

      // NOTE: /products/[slug] does not exist as a public route — product cards
      // link directly to affiliate_url. Product URLs are intentionally excluded
      // from the sitemap to avoid crawl waste on unservable paths.

      // Published custom pages (/p/[pageSlug]) are real public routes
      const pageEntries: MetadataRoute.Sitemap = pages.map((page) => ({
        url: `${baseUrl}/p/${page.slug}`,
        lastModified: page.updated_at ? new Date(page.updated_at) : new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.5,
      }));

      dynamicEntries = [...contentEntries, ...categoryEntries, ...pageEntries];
      dynamicFetchSucceeded = true;
    } catch (err) {
      logger.error("Sitemap: dynamic entries fetch failed, falling back to last-good", {
        domain: site.domain,
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, { context: "sitemap.dynamicEntries" });
    }
  }

  const result = [...staticEntries, ...dynamicEntries];

  if (dynamicFetchSucceeded) {
    // Fresh data — refresh the cache so the next outage has
    // something recent to fall back on.
    await writeLastGoodSitemap(site.domain, result);
    return result;
  }

  // Dynamic fetch failed (or was skipped). Try the last-good cache.
  const cached = await readLastGoodSitemap(site.domain);
  if (cached && cached.length > 0) {
    logger.warn("Sitemap: serving last-good cached entries", {
      domain: site.domain,
      cachedCount: cached.length,
    });
    return cached;
  }

  // No cache available — return at least the static entries. This is
  // the last-resort fallback; it is intentionally non-empty even if
  // the DB has never been reachable from this isolate.
  if (result.length > 0) return result;
  return staticFallback(site);
}
