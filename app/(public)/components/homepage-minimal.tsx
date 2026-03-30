import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";

type CategoryWithCount = CategoryRow & { product_count: number };
import { ContentCard } from "./content-card";
import { ProductCard } from "./product-card";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";

interface MinimalHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
}

export function MinimalHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
}: MinimalHomepageProps) {
  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";
  const firstContentType = site.contentTypes[0]?.value ?? "article";

  return (
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Hero — clean, centered */}
      <section
        className="relative overflow-hidden py-24 text-center md:py-32 lg:py-40"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1
            className="mb-6 text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {site.name}
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg font-light leading-relaxed text-gray-300">
            {site.brand.description}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={`/${firstContentType}`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full px-8 py-3 text-base font-semibold text-white transition-all duration-300 hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {site.language === "ar" ? "تصفح المحتوى" : "Browse Content"}
            </Link>
            {site.features.giftFinder && (
              <Link
                href="/gift-finder"
                className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/20 px-8 py-3 text-base font-semibold text-white transition-all duration-300 hover:bg-white/5"
              >
                {site.language === "ar" ? "اختبار الهدايا" : "Gift Finder"}
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Categories — horizontal pills */}
        {categories.length > 0 && (
          <section className="py-12">
            <div className="flex flex-wrap justify-center gap-3">
              {categories.map((cat, i) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  aria-label={`Browse ${cat.name} category`}
                  className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 ${i === 0 ? "border-gray-400 bg-gray-50 text-gray-900" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}
                >
                  {cat.name}
                  {cat.product_count > 0 && (
                    <span className="ml-1.5 text-xs text-gray-400">({cat.product_count})</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured Products */}
        {featuredProducts.length > 0 && (
          <section className="py-12">
            <h2
              className="mb-8 text-center text-2xl font-bold"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
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
          <section className="py-12">
            <div className="mb-8 flex items-center justify-between">
              <h2
                className="text-2xl font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {site.language === "ar" ? "أحدث المحتوى" : "Latest Content"}
              </h2>
              <Link
                href={`/${firstContentType}`}
                className="text-sm font-medium transition-colors"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                {site.language === "ar" ? "عرض الكل ←" : "View all →"}
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentContent.map((content) => (
                <ContentCard key={content.id} content={content} locale={locale} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {recentContent.length === 0 && featuredProducts.length === 0 && (
          <div className="py-24 text-center text-gray-400">
            <p className="text-lg">
              {site.language === "ar" ? "لا يوجد محتوى بعد" : "No content yet"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
