import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentSite } from "@/lib/site-context";
import type { SiteDefinition } from "@/config/site-definition";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { CalmShell } from "../components/calmroutine/shell";
import { CalmToolsPage } from "../components/calmroutine/tools-view";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.id === "calm-routine") {
    return {
      metadataBase: new URL(`https://${site.domain}`),
      title: "Recommended tools · calmroutine",
      description:
        "Sleep, calm, supplements, and somatic tools I have tested myself. Honest notes, affiliate disclosures, and a link to the review before every bigger purchase.",
      alternates: { canonical: `https://${site.domain}/tools` },
      openGraph: {
        title: "Recommended tools · calmroutine",
        description:
          "Sleep, calm, supplements, and somatic tools I have tested myself. Honest notes, affiliate disclosures, and a link to the review before every bigger purchase.",
        url: `https://${site.domain}/tools`,
        siteName: site.name,
        locale: site.locale,
        type: "website",
      },
    };
  }
  const isEtsy = (site.slug ?? site.id) === "ai-compared";
  const title = isEtsy ? "Free Etsy Seller Tools" : "Free Crypto Tax Tools for Australians";
  const description = isEtsy
    ? "Free tools for Etsy sellers: profit and break-even calculator, workflow checklists, and AI tool comparisons."
    : "Free crypto tax tools for Australian investors: software comparison matrix, ATO CGT calculator, and exchange-to-software sync guides.";
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

  const tools = [
    {
      href: "/tools/etsy-profit-calculator",
      title: "Etsy Profit & Break-Even Calculator",
      description:
        "Estimate listing, transaction, and payment fees per sale. See profit per unit, monthly profit, and break-even units.",
      cta: "Calculate profit",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Free Etsy Seller Tools
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Practical tools built for print-on-demand and digital-product sellers: profit calculators,
          workflow checklists, and AI tool comparisons.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            style={{
              borderInlineStartWidth: "3px",
              borderInlineStartColor: "var(--color-accent, #2D6BF0)",
            }}
          >
            <h2 className="text-lg font-semibold text-gray-900">{tool.title}</h2>
            <p className="mt-4 flex-1 text-gray-600">{tool.description}</p>
            <span className="mt-auto inline-flex items-center pt-3 text-sm font-semibold text-[color:var(--color-accent,#2D6BF0)] group-hover:underline">
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

export default async function ToolsIndexPage() {
  const site = await getCurrentSite();
  if (site.id === "calm-routine") {
    return (
      <CalmShell site={site}>
        <div className="mx-auto max-w-5xl px-6 py-10">
          <CalmToolsPage />
        </div>
      </CalmShell>
    );
  }
  if ((site.slug ?? site.id) === "ai-compared") {
    return <EtsyToolsIndex site={site} />;
  }
  return <CryptoToolsIndex site={site} />;
}
