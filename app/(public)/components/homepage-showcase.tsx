import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import { ShowcaseHero } from "./showcase/showcase-hero";
import { Marquee } from "./showcase/showcase-ui";
import { CollectionGrid } from "./showcase/collection-grid";
import { ShowcaseTrust } from "./showcase/showcase-trust";
import { ShowcaseJournal } from "./showcase/showcase-journal";

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
 * "Showcase" homepage — an editorial dark storefront with a premium hero,
 * infinite category marquee, filterable collection grid, trust section, and
 * journal. Designed for gift/product authority sites (WristNerd, CryptoRanked,
 * CalmRoutine) and inspired by awwwards/v0-style editorial layouts.
 *
 * The `dark` wrapper scopes the shadcn dark token palette to this template
 * only — the rest of the site (header, footer, inner pages) keeps its
 * per-site theme tokens.
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
      : ["Curated", "Independent", "Reviewed", "Affiliate-Supported", "Honest Picks"];

  return (
    <div className="dark -mt-20 bg-background text-foreground">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      <div className="flex-1">
        <ShowcaseHero
          site={site}
          featuredProducts={featuredProducts}
          categories={categories}
          productCount={productCount}
          reviewCount={reviewCount}
        />
        <Marquee items={marqueeItems} />
        <CollectionGrid
          products={featuredProducts}
          categories={categories}
          productLabelPlural={site.productLabelPlural}
        />
        <ShowcaseTrust
          site={site}
          productCount={productCount}
          reviewCount={reviewCount}
          categoryCount={categories.length}
        />
        <ShowcaseJournal site={site} recentContent={recentContent} />
      </div>
    </div>
  );
}
