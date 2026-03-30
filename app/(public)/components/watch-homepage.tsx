import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";

type CategoryWithCount = CategoryRow & { product_count: number };
import { ContentCard } from "./content-card";
import { ProductCard } from "./product-card";
import { GiftWorthinessScore } from "./gift-worthiness-score";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";

/** Default SVG path for occasion icons when no category-specific icon is available. */
const DEFAULT_OCCASION_ICON = "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z";

interface WatchHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
}

export function WatchHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
}: WatchHomepageProps) {
  const locale = "en-US";
  const ctaLabel = "View Deal";

  // Derive occasions and budgets from categories (data-driven)
  const occasions = categories
    .filter((c) => c.taxonomy_type === "occasion")
    .map((c) => ({
      href: `/occasion/${c.slug}`,
      label: c.name,
      icon: DEFAULT_OCCASION_ICON,
    }));

  const budgets = categories
    .filter((c) => c.taxonomy_type === "budget")
    .map((c) => ({
      href: `/budget/${c.slug}`,
      label: c.name,
      desc: c.description || "",
    }));

  // Editor's picks: top-scored featured products (data-driven)
  const editorsPicks = featuredProducts
    .filter((p) => p.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 4)
    .map((p) => ({
      name: p.name,
      tagline: p.description?.slice(0, 40) || "",
      badge: "Top Rated",
      score: p.score ?? 0,
      price: p.price || "",
      href: `/review/${p.slug}`,
    }));

  return (
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Hero Section - Cinematic */}
      <section
        className="relative flex min-h-[90vh] items-center overflow-hidden text-white"
        style={{ backgroundColor: "var(--color-primary, #1B2A4A)" }}
      >
        {/* Layered background effects */}
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
            {/* Eyebrow */}
            <div className="mb-8 flex items-center gap-3">
              <div
                className="h-px w-12"
                style={{ background: `linear-gradient(to right, var(--color-accent), transparent)` }}
              />
              <span
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--color-accent)" }}
              >
                Expert Watch Gift Guides
              </span>
            </div>

            {/* Main heading */}
            <h1
              className="mb-8 text-5xl font-bold leading-[1.05] text-white md:text-6xl lg:text-7xl"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Find the Perfect{" "}
              <br className="hidden sm:block" />
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 70%, white))`,
                }}
              >
                Watch Gift
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mb-12 max-w-2xl text-lg font-light leading-relaxed text-gray-400 md:text-xl">
              Expert reviews, honest ratings, and a proprietary Gift-Worthiness
              Score to help you pick a watch they&apos;ll actually love. No fluff, no
              sponsored rankings.
            </p>

            {/* CTAs */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                href="/gift-finder"
                className="inline-flex min-h-[56px] items-center justify-center gap-2.5 rounded-full px-8 py-4 text-base font-semibold tracking-wide text-white transition-all duration-500 hover:shadow-lg"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                Take the Gift Finder Quiz
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="/review"
                className="inline-flex min-h-[56px] items-center justify-center rounded-full border border-white/20 bg-transparent px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all duration-500 hover:border-white/30 hover:bg-white/5"
              >
                Browse Reviews
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
      </section>

      {/* Trust Bar */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16">
            {[
              { value: "50+", label: "Watches Reviewed" },
              { value: "14", label: "In-Depth Reviews" },
              { value: "5", label: "Gift Score Factors" },
              { value: "0", label: "Sponsored Rankings" },
            ].map((stat, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="bg-clip-text text-3xl font-bold text-transparent"
                  style={{
                    fontFamily: "var(--font-heading)",
                    backgroundImage: `linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 70%, white))`,
                  }}
                >
                  {stat.value}
                </span>
                <span className="text-sm font-light text-gray-400">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Shop by Occasion */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mb-16 text-center">
            <div className="mb-5 flex items-center justify-center gap-3">
              <div className="h-px w-10" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
                Curated Guides
              </span>
              <div className="h-px w-10" style={{ background: `linear-gradient(to left, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
            </div>
            <h2
              className="mb-4 text-3xl font-bold leading-tight md:text-4xl"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              Shop by Occasion
            </h2>
            <p className="mx-auto max-w-xl font-light leading-relaxed text-gray-500">
              Every occasion calls for a different watch. We&apos;ve curated the best
              picks for each one.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6 lg:gap-5">
            {occasions.map((occ) => (
              <Link
                key={occ.href}
                href={occ.href}
                className="group flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md lg:p-8"
              >
                <span
                  className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-500"
                  style={{ background: `linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 10%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))` }}
                >
                  <svg className="h-6 w-6" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={occ.icon} />
                  </svg>
                </span>
                <span
                  className="text-center text-sm font-semibold transition-colors duration-300"
                  style={{ color: "var(--color-primary)" }}
                >
                  {occ.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Shop by Budget */}
      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <div className="mb-5 flex items-center justify-center gap-3">
              <div className="h-px w-10" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
                Every Price Point
              </span>
              <div className="h-px w-10" style={{ background: `linear-gradient(to left, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
            </div>
            <h2
              className="mb-4 text-3xl font-bold leading-tight md:text-4xl"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              Shop by Budget
            </h2>
            <p className="mx-auto max-w-xl font-light leading-relaxed text-gray-500">
              Great watches exist at every price point. Here are our favorites by
              budget range.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 lg:gap-5">
            {budgets.map((b) => (
              <Link
                key={b.href}
                href={b.href}
                className="group flex flex-col items-center rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-7 shadow-sm transition-all duration-300 hover:shadow-md lg:p-8"
              >
                <span
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-500"
                  style={{ background: `linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 10%, transparent), color-mix(in srgb, var(--color-accent) 5%, transparent))` }}
                >
                  <svg className="h-5 w-5" style={{ color: "var(--color-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <span
                  className="mb-1 text-xl font-bold transition-colors duration-300"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
                >
                  {b.label}
                </span>
                <span className="text-xs font-light text-gray-500">{b.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Editor's Picks */}
      <section className="bg-gray-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <div className="mb-5 flex items-center justify-center gap-3">
              <div className="h-px w-10" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
                Hand-Picked
              </span>
              <div className="h-px w-10" style={{ background: `linear-gradient(to left, transparent, color-mix(in srgb, var(--color-accent) 50%, transparent))` }} />
            </div>
            <h2
              className="mb-4 text-3xl font-bold leading-tight md:text-4xl"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              Editor&apos;s Picks
            </h2>
            <p className="mx-auto max-w-xl font-light leading-relaxed text-gray-500">
              Our top-rated watches for gifting &mdash; chosen by our editorial team based
              on hands-on research and our Gift-Worthiness Score.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-7">
            {editorsPicks.map((watch) => (
              <Link
                key={watch.href}
                href={watch.href}
                className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md"
              >
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-gradient-to-br from-gray-100 to-gray-50">
                  <svg
                    className="relative z-10 h-20 w-20 text-gray-200 transition-colors duration-500 group-hover:text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={0.5}
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                    <path d="M12 3v1" />
                    <path d="M12 20v1" />
                    <path d="M3 12h1" />
                    <path d="M20 12h1" />
                  </svg>
                  <span
                    className="absolute left-4 top-4 z-20 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    {watch.badge}
                  </span>
                </div>
                <div className="p-6">
                  <p
                    className="mb-2.5 text-xs font-bold uppercase tracking-widest"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {watch.tagline}
                  </p>
                  <h3
                    className="mb-3 text-lg font-semibold transition-colors duration-300"
                    style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
                  >
                    {watch.name}
                  </h3>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="text-sm font-medium text-gray-500">{watch.price}</span>
                    <GiftWorthinessScore score={watch.score} size="sm" showLabel={false} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2
                className="mb-4 text-3xl font-bold leading-tight md:text-4xl"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                Browse Categories
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat, i) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className={`rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${i === 0 ? "border-current/20 ring-1 ring-current/10" : "border-gray-200"}`}
                  style={i === 0 ? { borderColor: "var(--color-accent)" } : undefined}
                >
                  <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                  {cat.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">{cat.description}</p>
                  )}
                  <span className="mt-2 inline-block text-xs text-gray-400">
                    {cat.product_count} {cat.product_count === 1 ? "product" : "products"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="bg-gray-50 py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className="text-2xl font-bold"
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

      {/* Gift Finder CTA */}
      <section
        className="relative overflow-hidden py-24 lg:py-32"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="absolute inset-0">
          <div
            className="absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full blur-[100px]"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 5%, transparent)" }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full blur-[80px]"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-accent) 3%, transparent)" }}
          />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-center gap-3">
            <div className="h-px w-10" style={{ background: `linear-gradient(to right, transparent, color-mix(in srgb, var(--color-accent) 40%, transparent))` }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              Personalized
            </span>
            <div className="h-px w-10" style={{ background: `linear-gradient(to left, transparent, color-mix(in srgb, var(--color-accent) 40%, transparent))` }} />
          </div>
          <h2
            className="mb-6 text-3xl font-bold leading-tight text-white md:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Not Sure Which Watch?
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-lg font-light leading-relaxed text-gray-400">
            Take our 60-second Gift Finder Quiz and get 3 personalized watch
            recommendations based on who you&apos;re buying for, the occasion,
            budget, and style.
          </p>
          <Link
            href="/gift-finder"
            className="inline-flex min-h-[56px] items-center gap-2.5 rounded-full px-10 py-4 text-lg font-semibold text-white transition-all duration-500 hover:shadow-lg"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Start the Quiz
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Recent Content */}
      {recentContent.length > 0 && (
        <section className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center justify-between">
              <h2
                className="text-2xl font-bold"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                Latest Content
              </h2>
              <Link
                href={`/${site.contentTypes[0]?.value ?? "article"}`}
                className="text-sm font-medium transition-colors"
                style={{ color: "var(--color-accent)" }}
              >
                View all &rarr;
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

    </div>
  );
}
