import type { MetadataRoute } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { listActiveProducts } from "@/lib/dal/products";

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

  // Dynamic content, category, and product pages
  const [content, categories, products] = await Promise.all([
    listPublishedContent(site.id, undefined, 1000),
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
