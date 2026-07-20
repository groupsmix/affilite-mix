import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSite } from "@/lib/site-context";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../components/json-ld";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const url = `https://${site.domain}/comparison`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: `Tool Comparisons for Etsy Sellers | ${site.name}`,
    description:
      "Head-to-head comparisons of AI-powered Etsy research, SEO, design, and POD tools. Prices and features are sourced from official pages; hands-on testing notes are added after we test.",
    alternates: { canonical: url },
    openGraph: {
      title: `Tool Comparisons for Etsy Sellers | ${site.name}`,
      description: "Honest comparisons for Etsy sellers with official pricing and feature data.",
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

const COMPARISONS = [
  {
    title: "EverBee vs Alura",
    subtitle: "Product research and SEO — which fits your shop stage?",
    href: "/comparison/everbee-vs-alura",
    status: "Pricing & features verified",
  },
  {
    title: "Kittl vs Canva for Etsy POD",
    subtitle: "Design, mockups, and commercial-use licensing compared.",
    href: "/comparison/kittl-vs-canva",
    status: "Pricing & features verified",
  },
  {
    title: "Printful vs Printify (AI-assisted workflow)",
    subtitle: "POD fulfilment, pricing, and mockup quality for Etsy.",
    href: null,
    status: "Planned",
  },
];

export default async function ComparisonHubPage() {
  const site = await getCurrentSite();
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Comparisons", path: "/comparison" },
  ]);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: COMPARISONS.filter((c) => c.href).map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://${site.domain}${c.href}`,
      name: c.title,
    })),
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={breadcrumbs} />
      <JsonLd data={itemListJsonLd} />

      <header className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Etsy tool comparisons
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Side-by-side comparisons built on official pricing and feature data. Hands-on testing
          notes and screenshots are added once we run each tool through a real Etsy workflow.
        </p>
      </header>

      <div className="space-y-6">
        {COMPARISONS.map((item) => {
          const Card = (
            <article className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{item.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{item.subtitle}</p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {item.status}
                </span>
              </div>
            </article>
          );
          return item.href ? (
            <Link key={item.title} href={item.href} className="group block">
              {Card}
            </Link>
          ) : (
            <div key={item.title}>{Card}</div>
          );
        })}
      </div>

      <section className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-gray-900">Model the cost before you subscribe</h2>
        <p className="mt-2 text-sm text-gray-600">
          Plug any subscription price into the profit calculator to see how many sales it takes to
          break even.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/tools/etsy-profit-calculator"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Try the free profit calculator
          </Link>
          <span className="inline-flex items-center justify-center text-sm text-gray-500">
            — works with any tool cost
          </span>
        </div>
      </section>
    </main>
  );
}
