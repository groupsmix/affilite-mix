import { getCurrentSite } from "@/lib/site-context";
import { getRecentContent } from "@/lib/dal/content";
import { listFeaturedProducts } from "@/lib/dal/products";
import { ContentCard } from "./components/content-card";
import { ProductCard } from "./components/product-card";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: site.name,
    description: site.brand.description,
    alternates: {
      canonical: "/",
    },
  };
}

export default async function HomePage() {
  const site = await getCurrentSite();
  const [recentContent, featuredProducts] = await Promise.all([
    getRecentContent(site.id, 6),
    listFeaturedProducts(site.id, 6),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Hero */}
      <section className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold">{site.name}</h1>
        <p className="text-lg text-gray-600">{site.brand.description}</p>
      </section>

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">
            {site.productLabelPlural} المميزة
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sourceType="homepage"
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Content */}
      {recentContent.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">أحدث المحتوى</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recentContent.map((content) => (
              <ContentCard key={content.id} content={content} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {recentContent.length === 0 && featuredProducts.length === 0 && (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg">لا يوجد محتوى بعد</p>
        </div>
      )}
    </div>
  );
}
