import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { getRecentContent, countPublishedContent } from "@/lib/dal/content";
import { listFeaturedProducts, countProducts } from "@/lib/dal/products";
import { listCategoriesWithProductCount } from "@/lib/dal/categories";
import { getTenantClient } from "@/lib/supabase-server";
import { getDialHomepageConfig, defaultDialConfig } from "@/lib/dial-config";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import dynamic from "next/dynamic";
import { ContentCard } from "./components/content-card";
import { ProductCard } from "./components/product-card";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./components/json-ld";
import Link from "next/link";
// Statically imported (NOT next/dynamic) so this Server Component renders in
// the initial SSR HTML. Lazy-loading the homepage template deferred its render
// past first paint; with the sticky-footer flex layout (main is flex-1) the
// footer rode up to the viewport bottom, then dropped by the full template
// height once the chunk resolved. On the tall compare homepage that is a ~0.15
// CLS, over the Lighthouse 0.1 gate. Server components ship no client JS, so a
// static import keeps the client bundle identical while painting the page at
// its final height.
import { CompareHomepage } from "./components/homepage-compare";
import { ShowcaseHomepage } from "./components/homepage-showcase";
import { TaxFinderHomepage } from "./components/homepage-taxfinder";
import { EtsyHomepage } from "./components/homepage-etsy";
import { DialHomepage } from "./components/homepage-dial";

/**
 * PROD-INCIDENT-2026-06-11 follow-up: surface failures in the homepage's
 * fan-out queries instead of swallowing them with `.catch(() => [])`.
 *
 * The original `.catch(() => fallback)` shape hid a 12-day full-content
 * outage on all four public sites because every query failed identically
 * and the page rendered the "No content yet" empty state silently. Each
 * branch now logs structured context AND ships the error to Sentry with
 * a `homepage-fanout` tag so a synthetic check can fire when the homepage
 * renders empty while the DB reports published content.
 */
function reportHomepageFanoutError(query: string, siteId: string, err: unknown): void {
  logger.error("[homepage] fan-out query failed; rendering fallback", {
    query,
    siteId,
    err: err instanceof Error ? { name: err.name, message: err.message } : err,
  });
  captureException(err, { tags: { area: "homepage-fanout", query }, siteId });
}

const CinematicHomepage = dynamic(() =>
  import("./components/homepage-cinematic").then((m) => m.CinematicHomepage),
);
const MinimalHomepage = dynamic(() =>
  import("./components/homepage-minimal").then((m) => m.MinimalHomepage),
);
const EditorialHomepage = dynamic(() =>
  import("./components/homepage-editorial").then((m) => m.EditorialHomepage),
);
const Top10Homepage = dynamic(() =>
  import("./components/homepage-top10").then((m) => m.Top10Homepage),
);

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isCryptoTaxAu =
    site.name === "Crypto Tax AU" ||
    site.domain === "cryptoranked.xyz" ||
    (site.slug ?? site.id) === "crypto-tools";
  const ogTitle = `${site.name} — ${site.brand.niche}`;
  const ogImageSrc = isCryptoTaxAu ? "/images/hero-crypto-tax-au.png" : site.brand.logo;
  const ogImage = ogImageSrc
    ? { url: ogImageSrc, width: 1536, height: 1024, alt: site.name }
    : undefined;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: { absolute: ogTitle },
    description: site.brand.description,
    alternates: {
      canonical: `https://${site.domain}/`,
    },
    openGraph: {
      title: ogTitle,
      description: site.brand.description,
      url: `https://${site.domain}/`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: site.brand.description,
      ...(ogImage ? { images: [ogImage.url] } : {}),
    },
  };
}

/** Revalidate homepage every 60 seconds (ISR) */
export const revalidate = 60;

export default async function HomePage() {
  const site = await getCurrentSite();
  const template =
    site.homepageTemplate ?? (site.features.customHomepage ? "cinematic" : "standard");

  const [recentContent, featuredProducts, categories, productCount, reviewCount, dialConfig] =
    await Promise.all([
      getRecentContent(site.id, 9).catch((err) => {
        reportHomepageFanoutError("getRecentContent", site.id, err);
        return [];
      }),
      listFeaturedProducts(site.id, 12).catch((err) => {
        reportHomepageFanoutError("listFeaturedProducts", site.id, err);
        return [];
      }),
      listCategoriesWithProductCount(site.id).catch((err) => {
        reportHomepageFanoutError("listCategoriesWithProductCount", site.id, err);
        return [];
      }),
      countProducts({ siteId: site.id, status: "active" }, getTenantClient).catch((err) => {
        reportHomepageFanoutError("countProducts", site.id, err);
        return 0;
      }),
      countPublishedContent(site.id, "review").catch((err) => {
        reportHomepageFanoutError("countPublishedContent", site.id, err);
        return 0;
      }),
      getDialHomepageConfig(site.id).catch((err) => {
        reportHomepageFanoutError("getDialHomepageConfig", site.id, err);
        return null;
      }),
    ]);

  // Render homepage based on template preset
  const homepageProps = {
    site,
    recentContent,
    featuredProducts,
    categories,
    productCount,
    reviewCount,
  };

  if (template === "cinematic") {
    return <CinematicHomepage {...homepageProps} />;
  }

  if (template === "minimal") {
    return <MinimalHomepage {...homepageProps} />;
  }

  if (template === "editorial") {
    return <EditorialHomepage {...homepageProps} />;
  }

  if (template === "top10") {
    return <Top10Homepage {...homepageProps} />;
  }

  if (template === "compare") {
    return <CompareHomepage {...homepageProps} />;
  }

  if (template === "showcase") {
    return <ShowcaseHomepage {...homepageProps} />;
  }

  if (template === "taxfinder") {
    return <TaxFinderHomepage {...homepageProps} />;
  }

  if (template === "etsy") {
    return <EtsyHomepage {...homepageProps} />;
  }

  if (template === "dial") {
    return <DialHomepage site={site} config={dialConfig ?? defaultDialConfig} />;
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
            {categories.map((cat, i) => (
              <Link
                key={cat.id}
                href={`/category/${cat.slug}`}
                className={`rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${i === 0 ? "border-emerald-300 ring-1 ring-emerald-100" : "border-gray-200"}`}
              >
                <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                {cat.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{cat.description}</p>
                )}
                <span className="mt-2 inline-block text-xs text-gray-500">
                  {cat.product_count} {cat.product_count === 1 ? "product" : "products"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">{site.productLabelPlural}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product, i) => (
              // audit5-#9: the standard-template homepage has no hero
              // image and the first card in the Featured Products grid
              // is typically the LCP candidate on real-device runs.
              // Mark only the first card priority so Next.js fetches the
              // image with high priority and inserts the `fetchpriority`
              // attribute on the <img>; the rest stay lazy.
              <ProductCard
                key={product.id}
                product={product}
                sourceType="homepage"
                ctaLabel={ctaLabel}
                priority={i === 0}
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
            {recentContent.map((content, i) => (
              // audit5-#9: when featuredProducts is empty, the first
              // content thumbnail becomes the LCP. Only flip priority on
              // the first card AND only when no featured-products grid
              // is rendered above it — otherwise the featured-products
              // priority={i===0} card is still the higher LCP candidate.
              <ContentCard
                key={content.id}
                content={content}
                locale={locale}
                priority={i === 0 && featuredProducts.length === 0}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {recentContent.length === 0 && featuredProducts.length === 0 && (
        <div className="py-16 text-center text-gray-500">
          <p className="text-lg">
            {site.language === "ar" ? "لا يوجد محتوى بعد" : "No content yet"}
          </p>
        </div>
      )}
    </div>
  );
}
