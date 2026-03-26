import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listFeaturedProducts } from "@/lib/dal/products";
import { getRecentContent } from "@/lib/dal/content";
import { listCategories } from "@/lib/dal/categories";
import { ProductCard } from "./components/product-card";
import { ContentCard } from "./components/content-card";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: `${site.name} — ${site.brand.niche}`,
    description: site.brand.description,
    alternates: { canonical: `https://${site.domain}/` },
  };
}

export default async function HomePage() {
  const site = await getCurrentSite();
  const [featuredProducts, recentContent, categories] = await Promise.all([
    listFeaturedProducts(site.id, 6),
    getRecentContent(site.id, 6),
    listCategories(site.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero */}
      <section className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold text-gray-900">{site.name}</h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-600">
          {site.brand.description}
        </p>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Categories</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/category/${cat.slug}`}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                {cat.description && (
                  <p className="mt-1 text-sm text-gray-500">{cat.description}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">
            Featured {site.productLabelPlural}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} siteId={site.id} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Content */}
      {recentContent.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold text-gray-900">Latest Content</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentContent.map((item) => (
              <ContentCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      )}

      {/* Affiliate Disclosure */}
      <div className="rounded-lg bg-gray-50 p-4 text-center text-xs text-gray-400">
        {site.affiliateDisclosure}
      </div>
    </div>
  );
}
