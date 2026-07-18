import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { listProducts } from "@/lib/dal/products";
import { getTenantClient } from "@/lib/supabase-server";
import { CryptoTaxComparisonMatrix } from "../../components/crypto-tax-comparison-matrix";
import { CRYPTO_TAX_PRODUCT_FEATURES } from "@/lib/crypto-tax-au-tools";
import { JsonLd, organizationJsonLd } from "../../components/json-ld";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const title = "Crypto Tax Software Comparison for Australia (2026)";
  const description =
    "Compare the best crypto tax software for Australians side by side — pricing, ATO reports, exchange support, DeFi/NFT handling and customer support.";
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: `https://${site.domain}/tools/crypto-tax-comparison` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/tools/crypto-tax-comparison`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function CryptoTaxComparisonPage() {
  const site = await getCurrentSite();

  const allProducts = await listProducts(
    { siteId: site.id, status: "active", limit: 50 },
    getTenantClient,
  );

  const matrixSlugs = new Set(Object.keys(CRYPTO_TAX_PRODUCT_FEATURES));
  const products = allProducts
    .filter((p) => matrixSlugs.has(p.slug))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const jsonLd = organizationJsonLd(site);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="mb-8 text-center sm:mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Crypto Tax Software Comparison
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Compare Australian crypto tax tools side by side — pricing, ATO compliance, integrations
          and support.
        </p>
      </div>

      <CryptoTaxComparisonMatrix products={products} />

      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
        <p>
          Scores are based on ATO report quality, exchange/wallet coverage, DeFi/NFT handling, ease
          of use and Australian pricing. Affiliate links help keep this site independent — they
          never change our rankings.
        </p>
      </div>

      <JsonLd data={jsonLd} />
    </main>
  );
}
