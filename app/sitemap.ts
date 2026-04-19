import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listPublishedPages } from "@/lib/dal/pages";
import { logger } from "@/lib/logger";

const MAX_CONTENT_URLS = 5_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let site;
  try {
    site = await getCurrentSite();
  } catch (err) {
    logger.warn("Sitemap: failed to resolve site, returning empty sitemap", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const baseUrl = `https://${site.domain}`;

  const staticEntries: MetadataRoute.Sitemap = site.seo.sitemapStaticPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: page.priority,
  }));

  let dynamicEntries: MetadataRoute.Sitemap = [];
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
      lastModified: new Date(),
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
  } catch (err) {
    logger.warn("Sitemap: failed to fetch dynamic entries, returning static pages only", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return [...staticEntries, ...dynamicEntries];
}
