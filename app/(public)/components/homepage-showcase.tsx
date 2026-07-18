import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import { ShowcaseHero } from "./showcase/showcase-hero";
import { Marquee } from "./showcase/showcase-ui";
import { CollectionGrid } from "./showcase/collection-grid";
import { SocialProof } from "./showcase/social-proof";
import { Editorial } from "./showcase/editorial";

type CategoryWithCount = CategoryRow & { product_count: number };

interface ShowcaseHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
  productCount?: number;
  reviewCount?: number;
}

/**
 * "Showcase" homepage — an immersive dark storefront with a scroll-driven
 * 3D product hero (three.js/gsap, lazy-loaded client-side only), an
 * infinite category marquee, a filterable curated collection, social
 * proof, and an editorial section. Ported from the WristNerd storefront
 * design (groupsmix/hoodie-store).
 *
 * The `dark showcase-root` wrapper scopes the shadcn dark token palette
 * to this template only — the rest of the site (header, footer, inner
 * pages) keeps its per-site light theme.
 */
export function ShowcaseHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
  productCount = 0,
  reviewCount = 0,
}: ShowcaseHomepageProps) {
  const marqueeItems =
    categories.length > 0
      ? categories.map((c) => c.name)
      : ["Dive", "Field", "Dress", "Chronograph", "Minimalist", "GMT", "Pilot", "Skeleton"];

  return (
    <div className="dark showcase-root bg-background text-foreground">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      <main className="flex min-h-screen flex-col">
        {/* The visible hero is a client-only (ssr:false) WebGL scene, so the
            page would otherwise ship no server-rendered <h1>. This crawlable,
            keyword-relevant heading gives search engines and screen readers a
            proper page title without altering the cinematic hero. */}
        <h1 className="sr-only">
          {site.name} — {site.brand.niche}
        </h1>
        <ShowcaseHero siteName={site.name} productLabelPlural={site.productLabelPlural} />
        <Marquee items={marqueeItems} />
        <CollectionGrid
          products={featuredProducts}
          categories={categories}
          productLabelPlural={site.productLabelPlural}
        />
        <SocialProof
          siteName={site.name}
          productLabelPlural={site.productLabelPlural}
          productCount={productCount}
          reviewCount={reviewCount}
        />
        <Editorial
          siteName={site.name}
          productLabelPlural={site.productLabelPlural}
          recentContent={recentContent}
          productCount={productCount}
          reviewCount={reviewCount}
        />
      </main>
    </div>
  );
}
