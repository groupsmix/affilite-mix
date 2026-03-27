import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";
import { listActiveProducts } from "@/lib/dal/products";
import { listCategories } from "@/lib/dal/categories";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getCurrentSite();
  const baseUrl = `https://${site.domain}`;

  // Static pages from site config
  const staticEntries: MetadataRoute.Sitemap = site.seo.sitemapStaticPages.map(
    (page) => ({
      url: `${baseUrl}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
      priority: page.priority,
    }),
  );

  // Dynamic content pages
  const [content, products, categories] = await Promise.all([
    listPublishedContent(site.id, undefined, 1000),
    listActiveProducts(site.id),
    listCategories(site.id),
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

  // Products don't have their own pages in this architecture,
  // but we include content pages that link to them
  void products;

  return [...staticEntries, ...contentEntries, ...categoryEntries];
}
