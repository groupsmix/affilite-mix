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
      "Head-to-head comparisons of AI-powered Etsy research, SEO, design, and POD tools. We test first, then publish.",
    alternates: { canonical: url },
    openGraph: {
      title: `Tool Comparisons for Etsy Sellers | ${site.name}`,
      description: "Honest, tested comparisons for Etsy sellers.",
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

const UPCOMING = [
  {
    title: "EverBee vs Alura",
    subtitle: "Product research and SEO — which fits your shop stage?",
    status: "In testing",
  },
  {
    title: "Kittl vs Canva for Etsy POD",
    subtitle: "Design, mockups, and commercial-use licensing compared.",
    status: "Planned",
  },
  {
    title: "Printful vs Printify (AI-assisted workflow)",
    subtitle: "POD fulfilment, pricing, and mockup quality for Etsy.",
    status: "Planned",
  },
];

export default async function ComparisonHubPage() {
  const site = await getCurrentSite();
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Comparisons", path: "/comparison" },
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={breadcrumbs} />

      <header className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Etsy tool comparisons
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          We run each tool through the same real Etsy workflow before we compare them. Every verdict
          links to screenshots, methodology, and the latest official pricing.
        </p>
      </header>

      <div className="space-y-6">
        {UPCOMING.map((item) => (
          <article key={item.title} className="rounded-2xl border border-gray-200 bg-white p-6">
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
        ))}
      </div>

      <section className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-gray-900">
          Want the first comparison as soon as it is live?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Drop your email and we will send the full comparison plus the exact workflow we used to
          test both tools.
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
            — while testing is in progress
          </span>
        </div>
      </section>
    </main>
  );
}
