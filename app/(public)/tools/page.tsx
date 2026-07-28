import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getCurrentSite } from "@/lib/site-context";
import type { SiteDefinition } from "@/config/site-definition";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { CalmShell } from "../components/calmroutine/shell";
import { CalmToolsPage } from "../components/calmroutine/tools-view";
import { getCalmConfig } from "@/lib/calm-config";
import { etsyTools } from "@/lib/etsy-product-data";
import { EtsyToolCard } from "../components/etsy-tool-card";

export const revalidate = 60;

const TOOLSET_META: Record<string, { title: string; description: string }> = {
  "calm-routine": {
    title: "Recommended tools · calmroutine",
    description:
      "Sleep, calm, supplements, and somatic tools I have tested myself. Honest notes, affiliate disclosures, and a link to the review before every bigger purchase.",
  },
  "ai-compared": {
    title: "Free Etsy Seller Tools",
    description:
      "Free tools for Etsy sellers: profit and break-even calculator, workflow checklists, and AI tool comparisons.",
  },
  "crypto-tools": {
    title: "Free Crypto Tax Tools for Australians",
    description:
      "Free crypto tax tools for Australian investors: software comparison matrix, ATO CGT calculator, and exchange-to-software sync guides.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const meta = TOOLSET_META[site.slug ?? site.id];
  if (!meta) {
    return { title: "Not Found" };
  }
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `https://${site.domain}/tools` },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: `https://${site.domain}/tools`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

function CryptoToolsIndex({ site }: { site: SiteDefinition }) {
  const jsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Tools", path: "/tools" },
  ]);

  const tools = [
    {
      href: "/tools/crypto-tax-comparison",
      title: "Crypto Tax Software Comparison",
      image: "/images/tools-crypto-tax-comparison.png",
      description:
        "Side-by-side comparison of Australian crypto tax tools — pricing, ATO reports, integrations and support.",
      cta: "Compare now",
    },
    {
      href: "/tools/cgt-calculator",
      title: "ATO CGT Calculator",
      image: "/images/tools-cgt-calculator.png",
      description:
        "Estimate your Australian crypto capital gains tax with the 12-month 50% discount, income bracket and Medicare levy.",
      cta: "Calculate now",
    },
    {
      href: "/tools/sync-guide/coinspot/koinly",
      title: "Sync Guides",
      image: "/images/tools-sync-guides.png",
      description:
        "Step-by-step help for importing CoinSpot, Swyftx, Binance Australia and Crypto.com into Koinly, Syla, CoinLedger and more.",
      cta: "View guides",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
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
            className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-gray-100">
              <Image
                src={tool.image}
                alt={tool.title}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>
            <p className="mt-4 text-gray-600">{tool.description}</p>
            <span className="mt-auto inline-flex items-center pt-3 text-sm font-semibold text-[color:var(--color-accent,#16A34A)] group-hover:underline">
              {tool.cta}
              <ArrowRight className="ml-1 size-4" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      <JsonLd data={jsonLd} />
    </main>
  );
}

function EtsyToolsIndex({ site }: { site: SiteDefinition }) {
  const jsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Tools", path: "/tools" },
  ]);

  const toolList = Object.values(etsyTools);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Etsy Seller Tools
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          The tools we cover for product research, design, listing optimization, and POD
          fulfillment. Every card links to the official site; affiliate links are added once
          approved.
        </p>
      </div>

      <section className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {toolList.map((tool) => (
          <EtsyToolCard key={tool.slug} tool={tool} />
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Free Etsy Profit & Break-Even Calculator
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Estimate listing, transaction, and payment fees per sale. See profit per unit, monthly
              profit, and break-even units before you list.
            </p>
          </div>
          <Link
            href="/tools/etsy-profit-calculator"
            className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          >
            Calculate profit
            <ArrowRight className="ml-1 size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <JsonLd data={jsonLd} />
    </main>
  );
}

export default async function ToolsIndexPage() {
  const site = await getCurrentSite();
  if (site.slug === "calm-routine") {
    const calmConfig = await getCalmConfig(site.id);
    return (
      <CalmShell site={site}>
        <div className="mx-auto max-w-5xl px-6 py-10">
          <CalmToolsPage config={calmConfig} />
        </div>
      </CalmShell>
    );
  }
  if (site.slug === "ai-compared") {
    return <EtsyToolsIndex site={site} />;
  }
  if (site.slug === "crypto-tools" || site.domain === "cryptoranked.xyz") {
    return <CryptoToolsIndex site={site} />;
  }
  notFound();
}
