import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listPublishedPages } from "@/lib/dal/pages";
import { shouldSkipDbCall } from "@/lib/db-available";
import { canonicalizeVsSlug } from "@/lib/vs-slug";
import { logger } from "@/lib/logger";
import { captureException, captureMessage } from "@/lib/sentry";
import { getAllSyncGuideParams } from "@/lib/crypto-tax-au-tools";

/**
 * audit5-#21: when the last-good cache is older than this, the fallback
 * read path emits a Sentry `captureMessage` so the SEO team can be
 * notified before the 24h TTL expires and the site falls off the
 * sitemap entirely. This is paired with the existing logger.warn so
 * both log streams (Cloudflare Logs + Sentry) see the same signal.
 */
const STALE_CACHE_ALERT_THRESHOLD_SECONDS = 60 * 60; // 1h

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
    // fail-open: best-effort [criticality:non-critical]
    return null;
  }
}

/**
 * audit5-#21: cache value type. The previous schema serialised the
 * sitemap as a bare array; we now wrap it with a `cachedAt` timestamp
 * so the read path can compute the cache age and emit a stale-cache
 * alert. Bare-array values are still accepted on read (no `cachedAt`
 * means "unknown age" — we treat that as stale and alert once).
 */
interface CachedSitemap {
  cachedAt: number;
  entries: MetadataRoute.Sitemap;
}

function isCachedSitemapShape(v: unknown): v is CachedSitemap {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.cachedAt === "number" && Array.isArray(obj.entries);
}

async function readLastGoodSitemap(
  siteDomain: string,
): Promise<{ entries: MetadataRoute.Sitemap; ageSeconds: number | null } | null> {
  const kv = getKv();
  if (!kv) return null;
  try {
    const raw = await kv.get(lastGoodKey(siteDomain), "text");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isCachedSitemapShape(parsed)) {
      const ageMs = Date.now() - parsed.cachedAt;
      const ageSeconds = ageMs >= 0 ? Math.floor(ageMs / 1000) : 0;
      return { entries: parsed.entries, ageSeconds };
    }
    // Legacy bare-array shape — unknown age. Return as stale so the
    // caller emits an alert; the next successful refresh will upgrade
    // the cache to the new shape.
    if (Array.isArray(parsed)) {
      return { entries: parsed as MetadataRoute.Sitemap, ageSeconds: null };
    }
    return null;
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
    // audit5-#21: wrap with cachedAt timestamp so the read path can
    // compute age and alert on stale cache.
    const payload: CachedSitemap = { cachedAt: Date.now(), entries: sitemap };
    await kv.put(lastGoodKey(siteDomain), JSON.stringify(payload), {
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

  // Crypto Tax AU lead-magnet tools: comparison matrix, CGT calculator and
  // programmatic exchange-to-software sync guides.
  if (site.id === "crypto-tools") {
    staticEntries.push(
      {
        url: `${baseUrl}/tools`,
        lastModified: STATIC_LAST_MODIFIED,
        changeFrequency: "monthly",
        priority: 0.8,
      },
      {
        url: `${baseUrl}/tools/crypto-tax-comparison`,
        lastModified: STATIC_LAST_MODIFIED,
        changeFrequency: "monthly",
        priority: 0.8,
      },
      {
        url: `${baseUrl}/tools/cgt-calculator`,
        lastModified: STATIC_LAST_MODIFIED,
        changeFrequency: "monthly",
        priority: 0.8,
      },
      ...getAllSyncGuideParams().map(({ exchange, software }) => ({
        url: `${baseUrl}/tools/sync-guide/${exchange}/${software}`,
        lastModified: STATIC_LAST_MODIFIED,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    );
  }

  let dynamicEntries: MetadataRoute.Sitemap = [];
  let dynamicFetchSucceeded = false;

  if (!shouldSkipDbCall()) {
    try {
      const [content, categories, pages] = await Promise.all([
        listPublishedContent(site.id, undefined, MAX_CONTENT_URLS),
        listCategories(site.id),
        listPublishedPages(site.id),
      ]);

      // CA-302: emit comparison slugs in canonical (alphabetical) order and
      // collapse duplicates (the same comparison stored both ways), so the
      // sitemap never advertises two URLs for one page. canonicalizeVsSlug is
      // a no-op for non-comparison slugs.
      const seenContentUrls = new Set<string>();
      const contentEntries: MetadataRoute.Sitemap = [];
      for (const item of content) {
        const slug = item.type === "comparison" ? canonicalizeVsSlug(item.slug) : item.slug;
        const url = `${baseUrl}/${item.type}/${slug}`;
        if (seenContentUrls.has(url)) continue;
        seenContentUrls.add(url);
        contentEntries.push({
          url,
          lastModified: item.updated_at
            ? new Date(item.updated_at)
            : item.created_at
              ? new Date(item.created_at)
              : STATIC_LAST_MODIFIED,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        });
      }

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
        lastModified: page.updated_at
          ? new Date(page.updated_at)
          : page.created_at
            ? new Date(page.created_at)
            : STATIC_LAST_MODIFIED,
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
  if (cached && cached.entries.length > 0) {
    // audit5-#21: log + alert when the cache is stale. The threshold is
    // intentionally below the 24h TTL so we get a signal *before* the
    // cache expires and the site falls off the sitemap entirely.
    const isStale =
      cached.ageSeconds === null || cached.ageSeconds > STALE_CACHE_ALERT_THRESHOLD_SECONDS;
    logger.warn("Sitemap: serving last-good cached entries", {
      domain: site.domain,
      cachedCount: cached.entries.length,
      ageSeconds: cached.ageSeconds,
      isStale,
    });
    if (isStale) {
      // captureMessage routes to Sentry; the SEO team can wire a
      // notification on the `sitemap.fallback_to_cache_stale` event.
      // Pre-#1 (P0) Sentry was a no-op; now it actually delivers.
      captureMessage("sitemap.fallback_to_cache_stale", "warning");
    }
    return cached.entries;
  }

  // No cache available — return at least the static entries. This is
  // the last-resort fallback; it is intentionally non-empty even if
  // the DB has never been reachable from this isolate.
  if (result.length > 0) return result;
  return staticFallback(site);
}
