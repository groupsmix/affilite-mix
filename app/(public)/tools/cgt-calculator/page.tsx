import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getProductBySlug } from "@/lib/dal/products";
import { getTenantClient } from "@/lib/supabase-server";
import { CgtCalculator } from "../../components/cgt-calculator";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../../components/json-ld";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.slug !== "crypto-tools" && site.domain !== "cryptoranked.xyz") {
    return { title: "Not Found" };
  }
  const title = "Australian Crypto CGT Calculator (ATO 50% Discount)";
  const description =
    "Estimate your Australian crypto capital gains tax with the ATO 12-month 50% discount. Includes income bracket, Medicare levy and capital-loss offsets.";
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: `https://${site.domain}/tools/cgt-calculator` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/tools/cgt-calculator`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function CgtCalculatorPage() {
  const site = await getCurrentSite();
  if (site.slug !== "crypto-tools" && site.domain !== "cryptoranked.xyz") {
    notFound();
  }
  const ctaProduct = await getProductBySlug(site.id, "koinly", getTenantClient);

  const jsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Tools", path: "/tools" },
    { name: "Australian Crypto CGT Calculator", path: "/tools/cgt-calculator" },
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <div className="mb-8 text-center sm:mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Australian Crypto CGT Calculator
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Estimate your capital gains tax on crypto sales using the ATO 50% discount for assets held
          more than 12 months.
        </p>
      </div>

      <CgtCalculator ctaProduct={ctaProduct} />

      <JsonLd data={jsonLd} />
    </main>
  );
}
