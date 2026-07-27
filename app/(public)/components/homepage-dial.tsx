import type { SiteDefinition } from "@/config/site-definition";
import type { DialHomepageConfig } from "@/lib/dial-config";
import type { ContentRow } from "@/types/database";
import type { CategoryRow } from "@/types/database";
import { Hero } from "./dial/hero";
import { TrustBar } from "./dial/trust-bar";
import { CategoryChips } from "./dial/category-chips";
import { PriceTiers } from "./dial/price-tiers";
import { TopPicks } from "./dial/top-picks";
import { TierSections } from "./dial/tier-sections";
import { ComparisonTable } from "./dial/comparison-table";
import { HowWeTest } from "./dial/how-we-test";
import { RecentReviews } from "./dial/recent-reviews";
import { Newsletter } from "./dial/newsletter";

interface DialHomepageProps {
  site: SiteDefinition;
  config: DialHomepageConfig;
  categories?: (CategoryRow & { product_count: number })[];
  recentContent?: ContentRow[];
}

export function DialHomepage({ site, config, categories, recentContent }: DialHomepageProps) {
  return (
    <div className="min-h-screen">
      <Hero config={config} />
      <TrustBar config={config} />
      <CategoryChips categories={categories ?? []} />
      <TopPicks config={config} />
      <PriceTiers config={config} />
      <RecentReviews content={recentContent ?? []} locale={site.locale} />
      <TierSections config={config} />
      <ComparisonTable config={config} />
      <HowWeTest config={config} />
      <Newsletter config={config} />
    </div>
  );
}
