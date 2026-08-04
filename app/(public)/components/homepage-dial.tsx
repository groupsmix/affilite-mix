import type { SiteDefinition } from "@/config/site-definition";
import type { DialHomepageConfig } from "@/lib/dial-config";
import type { CategoryRow, ContentRow } from "@/types/database";
import { Hero } from "./dial/hero";
import { FilterBar } from "./dial/filter-bar";
import { PriceTiers } from "./dial/price-tiers";
import { FeaturedReview } from "./dial/featured-review";
import { LatestReviews } from "./dial/latest-reviews";
import { TrustBar } from "./dial/trust-bar";

interface DialHomepageProps {
  site: SiteDefinition;
  config: DialHomepageConfig;
  /** Unused in the reference-matched layout; accepted for caller compatibility. */
  categories?: (CategoryRow & { product_count: number })[];
  recentContent?: ContentRow[];
}

export function DialHomepage({ config }: DialHomepageProps) {
  return (
    <div className="min-h-screen">
      <Hero config={config} />
      <FilterBar config={config} />
      <PriceTiers config={config} />
      <FeaturedReview config={config} />
      <LatestReviews config={config} />
      <TrustBar config={config} />
    </div>
  );
}
