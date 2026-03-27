import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { getRecentContent } from "@/lib/dal/content";
import { listFeaturedProducts } from "@/lib/dal/products";
import { listCategories } from "@/lib/dal/categories";
import { ContentCard } from "./components/content-card";
import { ProductCard } from "./components/product-card";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./components/json-ld";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: `${site.name} — ${site.brand.niche}`,
    description: site.brand.description,
    alternates: {
      canonical: `https://${site.domain}/`,
    },
    openGraph: {
      title: `${site.name} — ${site.brand.niche}`,
      description: site.brand.description,
      url: `https://${site.domain}/`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${site.name} — ${site.brand.niche}`,
      description: site.brand.description,
    },
  };
}

export default async function HomePage() {
  const site = await getCurrentSite();
  const [recentContent, featuredProducts, categories] = await Promise.all([
    getRecentContent(site.id, 6),
    listFeaturedProducts(site.id, 6),
    listCategories(site.id),
  ]);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />
      {/* Hero */}
      <section className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold">{site.name}</h1>
        <p className="text-lg text-gray-600">{site.brand.description}</p>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mb-12">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/category/${cat.slug}`}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="font-semibold text-gray-900">{cat.name}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">
            {site.productLabelPlural}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sourceType="homepage"
                ctaLabel={ctaLabel}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Content */}
      {recentContent.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">
            {site.language === "ar" ? "أحدث المحتوى" : "Latest Content"}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recentContent.map((content) => (
              <ContentCard key={content.id} content={content} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {recentContent.length === 0 && featuredProducts.length === 0 && (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg">
            {site.language === "ar" ? "لا يوجد محتوى بعد" : "No content yet"}
          </p>
        </div>
      )}
    </div>
  );
}
