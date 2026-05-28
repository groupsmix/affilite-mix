import Link from "next/link";
import Image from "next/image";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";

type CategoryWithCount = CategoryRow & { product_count: number };
import { ContentCard } from "./content-card";
import { ProductCard } from "./product-card";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";

interface EditorialHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
}

export function EditorialHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
}: EditorialHomepageProps) {
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";
  const firstContentType = site.contentTypes[0]?.value ?? "article";

  const heroContent = recentContent[0];
  const sideContent = recentContent.slice(1, 3);
  const remainingContent = recentContent.slice(3);

  return (
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Magazine Header */}
      <section
        className="border-b-4 py-6 text-center"
        style={{ borderColor: "var(--color-accent)" }}
      >
        <h1
          className="text-5xl font-bold tracking-tight md:text-6xl"
          style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
        >
          {site.name}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-lg text-gray-500">{site.brand.description}</p>
        <div
          className="mx-auto mt-4 h-px w-24"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Editorial Hero Grid — large left + stacked right */}
        {heroContent && (
          <section className="py-10">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main feature — spans 2 cols */}
              <div className="lg:col-span-2">
                <Link href={`/${heroContent.type}/${heroContent.slug}`} className="group block">
                  {heroContent.featured_image && (
                    <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
                      <Image
                        src={heroContent.featured_image}
                        alt={heroContent.title}
                        fill
                        sizes="(max-width: 1024px) 100vw, 66vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        // audit5-#9: this is the editorial template's hero
                        // image, sitting in the largest grid cell at the top
                        // of the page (16:9 spanning 2/3 of viewport width).
                        // It is virtually always the LCP candidate. Flag it
                        // priority so Next.js fetches it eagerly + emits
                        // fetchpriority="high" on the underlying <img>.
                        priority
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-6">
                        <span
                          className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white"
                          style={{ backgroundColor: "var(--color-accent)" }}
                        >
                          {heroContent.type}
                        </span>
                        <h2 className="mt-3 text-2xl font-bold leading-tight text-white md:text-3xl">
                          {heroContent.title}
                        </h2>
                        {heroContent.excerpt && (
                          <p className="mt-2 line-clamp-2 text-sm text-gray-200">
                            {heroContent.excerpt}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {!heroContent.featured_image && (
                    <div
                      className="flex aspect-[16/9] items-end rounded-lg p-6"
                      style={{ backgroundColor: "var(--color-primary)" }}
                    >
                      <div>
                        <span
                          className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white"
                          style={{ backgroundColor: "var(--color-accent)" }}
                        >
                          {heroContent.type}
                        </span>
                        <h2 className="mt-3 text-2xl font-bold text-white md:text-3xl">
                          {heroContent.title}
                        </h2>
                      </div>
                    </div>
                  )}
                </Link>
              </div>

              {/* Side stories */}
              <div className="flex flex-col gap-6">
                {sideContent.map((content) => (
                  <Link
                    key={content.id}
                    href={`/${content.type}/${content.slug}`}
                    className="group flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 transition-shadow hover:shadow-md"
                  >
                    {content.featured_image && (
                      <div className="relative aspect-[16/9] overflow-hidden">
                        <Image
                          src={content.featured_image}
                          alt={content.title}
                          fill
                          sizes="(max-width: 1024px) 100vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <span
                          className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: "var(--color-accent-text)" }}
                        >
                          {content.type}
                        </span>
                        <h3 className="mt-1 line-clamp-2 font-semibold leading-tight text-gray-900 group-hover:text-gray-600">
                          {content.title}
                        </h3>
                      </div>
                      {(content.publish_at ?? content.created_at) && (
                        <time
                          className="mt-2 text-xs text-gray-400"
                          dateTime={content.publish_at ?? content.created_at}
                        >
                          {new Date(content.publish_at ?? content.created_at).toLocaleDateString(
                            site.language === "ar" ? "ar-SA" : "en-US",
                          )}
                        </time>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Categories Strip */}
        {categories.length > 0 && (
          <section className="border-t border-gray-200 py-8">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-500 hover:text-gray-900"
                >
                  {cat.name}
                  {cat.product_count > 0 && (
                    <span className="ms-1 text-xs text-gray-400">({cat.product_count})</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured Products — horizontal scroll row */}
        {featuredProducts.length > 0 && (
          <section className="border-t border-gray-200 py-10">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className="text-2xl font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {site.language === "ar" ? "منتجات مميزة" : "Featured"} {site.productLabelPlural}
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
          </section>
        )}

        {/* Remaining Content — standard grid */}
        {remainingContent.length > 0 && (
          <section className="border-t border-gray-200 py-10">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className="text-2xl font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {site.language === "ar" ? "أحدث المحتوى" : "More Stories"}
              </h2>
              <Link
                href={`/${firstContentType}`}
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--color-accent-text)" }}
              >
                {site.language === "ar" ? "عرض الكل" : "View all"} →
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {remainingContent.map((content) => (
                <ContentCard key={content.id} content={content} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
