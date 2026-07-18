import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import Link from "next/link";
import { JsonLd, organizationJsonLd } from "../components/json-ld";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const title = "Free Crypto Tax Tools for Australians";
  const description =
    "Free crypto tax tools for Australian investors: software comparison matrix, ATO CGT calculator, and exchange-to-software sync guides.";
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: `https://${site.domain}/tools` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/tools`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function ToolsIndexPage() {
  const site = await getCurrentSite();
  const jsonLd = organizationJsonLd(site);

  const tools = [
    {
      href: "/tools/crypto-tax-comparison",
      title: "Crypto Tax Software Comparison",
      description:
        "Side-by-side comparison of Australian crypto tax tools — pricing, ATO reports, integrations and support.",
    },
    {
      href: "/tools/cgt-calculator",
      title: "ATO CGT Calculator",
      description:
        "Estimate your Australian crypto capital gains tax with the 12-month 50% discount, income bracket and Medicare levy.",
    },
    {
      href: "/tools/sync-guide/coinspot/koinly",
      title: "Sync Guides",
      description:
        "Step-by-step help for importing CoinSpot, Swyftx, Binance Australia and Crypto.com into Koinly, Syla, CoinLedger and more.",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Free Crypto Tax Tools
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Practical tools built for Australian crypto investors: compare tax software, estimate CGT
          and sync your exchange data.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h2 className="text-xl font-semibold text-gray-900 group-hover:text-[color:var(--color-accent,#16A34A)]">
              {tool.title}
            </h2>
            <p className="mt-2 text-gray-600">{tool.description}</p>
          </Link>
        ))}
      </div>

      <JsonLd data={jsonLd} />
    </main>
  );
}
