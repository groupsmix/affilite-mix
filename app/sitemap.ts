import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listActiveProducts } from "@/lib/dal/products";

/**
 * Maximum number of content URLs to include in the sitemap.
 * Google's limit is 50,000 URLs per sitemap; we cap at 5,000 to keep
 * the response reasonably sized. For sites that grow beyond this,
 * consider splitting into multiple sitemap files via a sitemap index
 * (requires a build-time-compatible site resolution strategy).
 */
const MAX_CONTENT_URLS = 5_000;

/**
 * Generate sitemap entries for the current site.
 *
 * NOTE: This is a fully dynamic sitemap (no generateSitemaps/generateStaticParams)
 * because the multi-tenant architecture resolves the active site from request
 * headers at runtime — `getCurrentSite()` calls `headers()` which is unavailable
 * at build time.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getCurrentSite();
  const baseUrl = `https://${site.domain}`;

  // Static pages from site config
  const staticEntries: MetadataRoute.Sitemap = site.seo.sitemapStaticPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: page.priority,
  }));

  // Dynamic content, category, and product pages
  const [content, categories, products] = await Promise.all([
    listPublishedContent(site.id, undefined, MAX_CONTENT_URLS),
    listCategories(site.id),
    listActiveProducts(site.id),
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

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${baseUrl}/products/${product.slug}`,
    lastModified: product.updated_at ? new Date(product.updated_at) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...contentEntries, ...categoryEntries, ...productEntries];
}
