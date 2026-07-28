import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { Breadcrumbs } from "../components/breadcrumbs";
import { JsonLd, breadcrumbJsonLd, organizationJsonLd } from "../components/json-ld";
import { AccountantLeadForm } from "../components/accountant-lead-form";
import { SponsoredAccountants } from "../components/sponsored-accountants";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.slug !== "crypto-tools" && site.domain !== "cryptoranked.xyz") {
    return { title: "Not Found" };
  }

  const title = "Find a Crypto Tax Accountant (AU)";
  const description = `Get matched with an Australian registered tax agent who specialises in crypto — DeFi, staking, airdrops, NFTs, ATO reviews and overdue returns on ${site.name}.`;

  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: `https://${site.domain}/find-crypto-tax-accountant` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/find-crypto-tax-accountant`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function FindCryptoTaxAccountantPage() {
  const site = await getCurrentSite();
  if (site.slug !== "crypto-tools" && site.domain !== "cryptoranked.xyz") {
    notFound();
  }

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Find a Crypto Tax Accountant", path: "/find-crypto-tax-accountant" },
  ]);

  return (
    <main>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={breadcrumbs} />

      <section className="bg-slate-900 px-4 py-12 text-white sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Find a Crypto Tax Accountant (AU)
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
            Get introduced to an Australian registered tax agent who understands DeFi, staking,
            airdrops, NFTs and ATO reviews. Free matching — you only pay the accountant.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-10">
        <Breadcrumbs
          items={[{ label: site.name, href: "/" }, { label: "Find a Crypto Tax Accountant" }]}
        />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-2 text-xl font-bold text-gray-900">Request a match</h2>
          <p className="mb-6 text-sm text-gray-600">
            Tell us your state, situation and transaction volume. We will pass your details to one
            or more crypto-specialist accountants and cc you on the introduction.
          </p>
          <AccountantLeadForm siteName={site.name} />
        </div>
      </section>

      <SponsoredAccountants />

      <section className="mx-auto max-w-3xl px-4 pb-12">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
          <p className="font-semibold text-gray-900">How it works</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>Fill in the form above with your state and crypto-tax situation.</li>
            <li>We review your details and match you with a registered tax agent.</li>
            <li>The accountant contacts you directly to discuss fees and next steps.</li>
          </ol>
          <p className="mt-4">{site.affiliateDisclosure}</p>
        </div>
      </section>
    </main>
  );
}
