import Link from "next/link";
import Image from "next/image";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";

type CategoryWithCount = CategoryRow & { product_count: number };
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";

interface Top10HomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
}

export function Top10Homepage({
  site,
  recentContent,
  featuredProducts,
  categories,
}: Top10HomepageProps) {
  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";
  const firstContentType = site.contentTypes[0]?.value ?? "article";

  return (
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Hero Banner */}
      <section
        className="py-16 text-center text-white md:py-20"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1
            className="text-4xl font-bold md:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {site.language === "ar"
              ? `أفضل ${site.productLabelPlural}`
              : `Top ${site.productLabelPlural}`}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">{site.brand.description}</p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Category filters */}
        {categories.length > 0 && (
          <section className="mb-10">
            <div className="flex flex-wrap justify-center gap-2">
              {categories.map((cat, i) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    i === 0
                      ? "border-transparent text-white"
                      : "border-gray-200 text-gray-700 hover:border-gray-400"
                  }`}
                  style={i === 0 ? { backgroundColor: "var(--color-accent)" } : undefined}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Numbered Product List */}
        {featuredProducts.length > 0 && (
          <section className="mb-12">
            <ol className="space-y-4">
              {featuredProducts.map((product, index) => (
                <li key={product.id} className="group">
                  <div className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-lg sm:p-6">
                    {/* Rank number */}
                    <div className="flex shrink-0 items-start">
                      <span
                        className="flex size-12 items-center justify-center rounded-full text-xl font-bold text-white sm:size-14 sm:text-2xl"
                        style={{
                          backgroundColor:
                            index < 3 ? "var(--color-accent)" : "var(--color-primary)",
                        }}
                      >
                        {index + 1}
                      </span>
                    </div>

                    {/* Product image */}
                    {product.image_url && (
                      <div className="hidden shrink-0 sm:block">
                        <Image
                          src={product.image_url}
                          alt={product.image_alt || product.name}
                          width={96}
                          height={96}
                          className="size-24 rounded-lg object-contain"
                        />
                      </div>
                    )}

                    {/* Product info */}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 sm:text-xl">
                        {product.name}
                      </h3>
                      {product.merchant && (
                        <p className="mt-0.5 text-sm text-gray-500">{product.merchant}</p>
                      )}
                      {product.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                          {product.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {product.price && (
                          <span
                            className="text-lg font-bold"
                            style={{ color: "var(--color-accent-text)" }}
                          >
                            {product.price}
                          </span>
                        )}
                        {product.score != null && (
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-sm font-semibold text-gray-800">
                            {product.score}/10
                          </span>
                        )}
                        {hasUsableAffiliateUrl(product.affiliate_url) && (
                          <a
                            href={product.affiliate_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                            style={{ backgroundColor: "var(--color-accent)" }}
                          >
                            {product.cta_text || ctaLabel}
                            <svg
                              className="size-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M14 5l7 7m0 0l-7 7m7-7H3"
                              />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Recent Content */}
        {recentContent.length > 0 && (
          <section className="border-t border-gray-200 pt-10">
            <div className="mb-8 flex items-center justify-between">
              <h2
                className="text-2xl font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {site.language === "ar" ? "أحدث المحتوى" : "Latest Content"}
              </h2>
              <Link
                href={`/${firstContentType}`}
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--color-accent-text)" }}
              >
                {site.language === "ar" ? "عرض الكل" : "View all"} →
              </Link>
            </div>

            <div className="space-y-4">
              {recentContent.map((content) => (
                <Link
                  key={content.id}
                  href={`/${content.type}/${content.slug}`}
                  className="group flex items-start gap-4 rounded-lg border border-gray-100 p-4 transition-all hover:border-gray-300 hover:shadow-sm"
                >
                  {content.featured_image && (
                    <Image
                      src={content.featured_image}
                      alt={content.title}
                      width={80}
                      height={80}
                      className="size-20 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--color-accent-text)" }}
                    >
                      {content.type}
                    </span>
                    <h3 className="mt-1 font-semibold text-gray-900 group-hover:text-gray-600">
                      {content.title}
                    </h3>
                    {content.excerpt && (
                      <p className="mt-1 line-clamp-1 text-sm text-gray-500">{content.excerpt}</p>
                    )}
                    {(content.publish_at ?? content.created_at) && (
                      <time
                        className="mt-1 block text-xs text-gray-400"
                        dateTime={content.publish_at ?? content.created_at}
                      >
                        {new Date(content.publish_at ?? content.created_at).toLocaleDateString(
                          locale,
                        )}
                      </time>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
