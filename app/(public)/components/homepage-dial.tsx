import type { SiteDefinition } from "@/config/site-definition";
import { SiteHeader } from "./dial/site-header";
import { Hero } from "./dial/hero";
import { TrustBar } from "./dial/trust-bar";
import { PriceTiers } from "./dial/price-tiers";
import { TopPicks } from "./dial/top-picks";
import { TierSections } from "./dial/tier-sections";
import { ComparisonTable } from "./dial/comparison-table";
import { HowWeTest } from "./dial/how-we-test";
import { Newsletter } from "./dial/newsletter";
import { SiteFooter } from "./dial/site-footer";

interface DialHomepageProps {
  site: SiteDefinition;
  recentContent: unknown[];
  featuredProducts: unknown[];
  categories: unknown[];
  productCount: number;
  reviewCount: number;
}

export function DialHomepage({ site, productCount, reviewCount }: DialHomepageProps) {
  return (
    <main className="min-h-screen">
      <SiteHeader site={site} />
      <Hero />
      <TrustBar productCount={productCount} reviewCount={reviewCount} />
      <PriceTiers />
      <TopPicks />
      <TierSections />
      <ComparisonTable />
      <HowWeTest />
      <Newsletter />
      <SiteFooter site={site} />
    </main>
  );
}
