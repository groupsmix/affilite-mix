import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent, countPublishedContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listActiveProducts } from "@/lib/dal/products";

/**
 * Maximum number of URLs per sitemap file.
 * Google's limit is 50,000 URLs per sitemap; we use a conservative 500
 * to keep each response small and fast.
 */
const SITEMAP_PAGE_SIZE = 500;

/**
 * Generate sitemap entries for a single page.
 * Page 0 includes static pages, categories, and products.
 * All pages include a slice of published content.
 */
export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const site = await getCurrentSite();
  const baseUrl = `https://${site.domain}`;
  const page = id;
  const offset = page * SITEMAP_PAGE_SIZE;

  // Fetch paginated content
  const content = await listPublishedContent(site.id, undefined, SITEMAP_PAGE_SIZE, offset);

  const contentEntries: MetadataRoute.Sitemap = content.map((item) => ({
    url: `${baseUrl}/${item.type}/${item.slug}`,
    lastModified: item.updated_at ? new Date(item.updated_at) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Page 0 also includes static pages, categories, and products
  if (page === 0) {
    const staticEntries: MetadataRoute.Sitemap = site.seo.sitemapStaticPages.map((pageConfig) => ({
      url: `${baseUrl}${pageConfig.path}`,
      lastModified: new Date(),
      changeFrequency:
        pageConfig.changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
      priority: pageConfig.priority,
    }));

    const [categories, products] = await Promise.all([
      listCategories(site.id),
      listActiveProducts(site.id),
    ]);

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

  return contentEntries;
}

/**
 * Generate sitemap index entries.
 * Next.js calls this to discover how many sitemap pages exist.
 */
export async function generateSitemaps() {
  const site = await getCurrentSite();
  const totalContent = await countPublishedContent(site.id);
  const totalPages = Math.max(1, Math.ceil(totalContent / SITEMAP_PAGE_SIZE));

  return Array.from({ length: totalPages }, (_, i) => ({ id: i }));
}
