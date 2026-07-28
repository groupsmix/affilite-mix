import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { Breadcrumbs } from "../components/breadcrumbs";
import { JsonLd, breadcrumbJsonLd, organizationJsonLd } from "../components/json-ld";
import { SponsoredAccountants } from "../components/sponsored-accountants";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.slug !== "crypto-tools" && site.domain !== "cryptoranked.xyz") {
    return { title: "Not Found" };
  }

  const title = "Find a Crypto Tax Accountant (AU)";
  const description = `Compare Australian crypto-tax accountants who sponsor this directory. Pick a firm and contact them directly on ${site.name}.`;

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
            Browse sponsored Australian registered tax agents who understand DeFi, staking,
            airdrops, NFTs and ATO reviews. Contact the firm that fits your situation directly.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-10">
        <Breadcrumbs
          items={[{ label: site.name, href: "/" }, { label: "Find a Crypto Tax Accountant" }]}
        />
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Sponsored directory</p>
          <p className="mt-1">
            The listings below are paid placements. We do not handle enquiries or bookings for them
            — click through and deal directly with each firm.
          </p>
        </div>
      </section>

      <SponsoredAccountants />

      <section className="mx-auto max-w-3xl px-4 pb-12">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
          <p className="font-semibold text-gray-900">Are you a crypto-tax accountant?</p>
          <p className="mt-2">
            Get your firm in front of Australian crypto investors. Listings are paid placements that
            run for a fixed term — no per-lead invoices, no daily management.
          </p>
          <a
            href={`mailto:contact@${site.domain}?subject=Sponsored accountant listing on ${site.name}`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Get listed
          </a>
          <p className="mt-4">{site.affiliateDisclosure}</p>
        </div>
      </section>
    </main>
  );
}
