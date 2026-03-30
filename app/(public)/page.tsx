import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { getRecentContent } from "@/lib/dal/content";
import { listFeaturedProducts } from "@/lib/dal/products";
import { listCategories } from "@/lib/dal/categories";
import dynamic from "next/dynamic";
import { ContentCard } from "./components/content-card";
import { ProductCard } from "./components/product-card";
import { NewsletterSignup } from "./components/newsletter-signup";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./components/json-ld";
import Link from "next/link";

const WatchHomepage = dynamic(() =>
  import("./components/watch-homepage").then((m) => m.WatchHomepage)
);
const CinematicHomepage = dynamic(() =>
  import("./components/homepage-cinematic").then((m) => m.CinematicHomepage)
);
const MinimalHomepage = dynamic(() =>
  import("./components/homepage-minimal").then((m) => m.MinimalHomepage)
);

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

/** Revalidate homepage every 60 seconds (ISR) */
export const revalidate = 60;

export default async function HomePage() {
  const site = await getCurrentSite();
  const [recentContent, featuredProducts, categories] = await Promise.all([
    getRecentContent(site.id, 6),
    listFeaturedProducts(site.id, 6),
    listCategories(site.id),
  ]);

  // Render homepage based on template preset
  const homepageProps = { site, recentContent, featuredProducts, categories };
  const template = site.homepageTemplate ?? (site.features.customHomepage ? "cinematic" : "standard");

  if (template === "cinematic") {
    // WatchHomepage is the existing cinematic implementation (watch-specific)
    // For other cinematic sites, use the generic CinematicHomepage
    if (site.id === "watch-tools") {
      return <WatchHomepage {...homepageProps} />;
    }
    return <CinematicHomepage {...homepageProps} />;
  }

  if (template === "minimal") {
    return <MinimalHomepage {...homepageProps} />;
  }

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
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">
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
        </section>
      )}

      {/* Recent Content */}
      {recentContent.length > 0 && (
        <section className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {site.language === "ar" ? "أحدث المحتوى" : "Latest Content"}
            </h2>
            <Link
              href={`/${site.contentTypes[0]?.value ?? "article"}`}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
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

      {/* Newsletter signup */}
      <section className="mb-12">
        <NewsletterSignup siteLanguage={site.language} />
      </section>

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
