import type { SiteDefinition } from "@/config/site-definition";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { Hero } from "./dial/hero";
import { TrustBar } from "./dial/trust-bar";
import { PriceTiers } from "./dial/price-tiers";
import { TopPicks } from "./dial/top-picks";
import { TierSections } from "./dial/tier-sections";
import { ComparisonTable } from "./dial/comparison-table";
import { HowWeTest } from "./dial/how-we-test";
import { Newsletter } from "./dial/newsletter";

interface DialHomepageProps {
  site: SiteDefinition;
  config: DialHomepageConfig;
}

export function DialHomepage({ site, config }: DialHomepageProps) {
  return (
    <div className="min-h-screen">
      <Hero config={config} />
      <TrustBar config={config} />
      <PriceTiers config={config} />
      <TopPicks config={config} />
      <TierSections config={config} />
      <ComparisonTable config={config} />
      <HowWeTest config={config} />
      <Newsletter config={config} />
    </div>
  );
}
