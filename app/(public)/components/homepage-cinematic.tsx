import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";
import { ContentCard } from "./content-card";
import { ProductCard } from "./product-card";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";

interface CinematicHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryRow[];
}

export function CinematicHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
}: CinematicHomepageProps) {
  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";
  const firstContentType = site.contentTypes[0]?.value ?? "article";

  return (
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Hero Section - Cinematic */}
      <section
        className="relative flex min-h-[90vh] items-center overflow-hidden text-white"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 85%, black) 0%, var(--color-primary) 50%, color-mix(in srgb, var(--color-primary) 85%, white) 100%)`,
            }}
          />
          <div
            className="absolute right-1/4 top-1/4 h-[500px] w-[500px] rounded-full blur-[120px]"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 7%, transparent)" }}
          />
          <div
            className="absolute bottom-1/4 left-[16%] h-[300px] w-[300px] rounded-full blur-[80px]"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 4%, transparent)" }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-8 lg:py-40">
          <div className="max-w-3xl">
            <div className="mb-8 flex items-center gap-3">
              <div
                className="h-px w-12"
                style={{ background: `linear-gradient(to right, var(--color-accent), transparent)` }}
              />
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--color-accent)" }}
              >
                {site.brand.niche}
              </span>
            </div>

            <h1
              className="mb-8 text-5xl font-bold leading-[1.05] text-white md:text-6xl lg:text-7xl"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {site.name}
            </h1>

            <p className="mb-12 max-w-2xl text-lg font-light leading-relaxed text-gray-400 md:text-xl">
              {site.brand.description}
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href={`/${firstContentType}`}
                className="inline-flex min-h-[56px] items-center justify-center gap-2.5 rounded-full px-8 py-4 text-base font-semibold tracking-wide text-white transition-all duration-500 hover:shadow-lg"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {site.language === "ar" ? "تصفح المحتوى" : "Browse Content"}
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              {site.features.giftFinder && (
                <Link
                  href="/gift-finder"
                  className="inline-flex min-h-[56px] items-center justify-center rounded-full border border-white/20 bg-transparent px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all duration-500 hover:border-white/30 hover:bg-white/5"
                >
                  {site.language === "ar" ? "اختبار الهدايا" : "Gift Finder"}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="bg-gray-50">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mb-16 text-center">
              <div className="mb-5 flex items-center justify-center gap-3">
                <div className="h-px w-10" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
                  {site.language === "ar" ? "التصنيفات" : "Categories"}
                </span>
                <div className="h-px w-10" style={{ background: `linear-gradient(to left, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
              </div>
              <h2
                className="mb-4 text-3xl font-bold leading-tight md:text-4xl"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {site.language === "ar" ? "تصفح حسب التصنيف" : "Browse by Category"}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className="group flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md lg:p-8"
                >
                  <span
                    className="text-center text-sm font-semibold transition-colors duration-300"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {cat.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 text-center">
              <h2
                className="mb-4 text-3xl font-bold leading-tight md:text-4xl"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {site.productLabelPlural}
              </h2>
            </div>
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
          </div>
        </section>
      )}

      {/* Recent Content */}
      {recentContent.length > 0 && (
        <section className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className="text-2xl font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {site.language === "ar" ? "أحدث المحتوى" : "Latest Content"}
              </h2>
              <Link
                href={`/${firstContentType}`}
                className="text-sm font-medium transition-colors"
                style={{ color: "var(--color-accent)" }}
              >
                {site.language === "ar" ? "عرض الكل ←" : "View all →"}
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentContent.map((content) => (
                <ContentCard key={content.id} content={content} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Empty state */}
      {recentContent.length === 0 && featuredProducts.length === 0 && categories.length === 0 && (
        <div className="py-24 text-center text-gray-400">
          <p className="text-lg">
            {site.language === "ar" ? "لا يوجد محتوى بعد" : "No content yet"}
          </p>
        </div>
      )}
    </div>
  );
}
