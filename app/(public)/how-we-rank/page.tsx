import { getCurrentSite } from "@/lib/site-context";
import { staticPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { isCryptoTaxAu, CryptoTaxAUHowWeRank } from "../components/site-static-content";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";

  return staticPageMetadata({
    site,
    title: isAr ? "كيف نقيم المنتجات" : "How We Rank",
    description: isAr
      ? `تعرف على معايير التقييم في ${site.name} وكيف نحافظ على الاستقلالية التحريرية.`
      : `Learn how ${site.name} evaluates and ranks products while keeping editorial independence.`,
    path: "/how-we-rank",
  });
}

export default async function HowWeRankPage() {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const isCrypto = isCryptoTaxAu(site);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold" style={{ color: "var(--ink)" }}>
        {isAr ? "كيف نقيم المنتجات" : "How We Rank"}
      </h1>

      <div className="prose prose-lg max-w-none" style={{ color: "var(--ink-70)" }}>
        {isCrypto ? (
          <CryptoTaxAUHowWeRank site={site} />
        ) : (
          <>
            <p className="text-lg leading-relaxed">
              {site.name} reviews and compares products based on features, pricing, ease of use and
              customer support. Our rankings are independent and never influenced by affiliate
              commissions.
            </p>

            <h2>What we review</h2>
            <p>
              We focus on products that solve a real need for our readers. We add new reviews when a
              product is widely used, offers a unique feature, or fills an obvious gap in the
              market.
            </p>

            <h2>How we score</h2>
            <p>
              Each product is scored against a consistent set of criteria. We weight the criteria
              based on what matters most to the target audience for that category.
            </p>
            <ul>
              <li>Features and capabilities</li>
              <li>Pricing and value</li>
              <li>Ease of use and setup</li>
              <li>Customer support and reputation</li>
              <li>Compatibility with relevant regulations or standards</li>
            </ul>

            <h2>Editorial independence</h2>
            <p>
              Affiliate relationships may help support the site, but they do not change our ratings,
              rankings or recommendations. We recommend the product we believe is best for a given
              use case.
            </p>

            <h2>Updates</h2>
            <p>
              We review product data and pricing at least quarterly and update content when
              significant changes occur.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
