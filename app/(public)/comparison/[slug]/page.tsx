import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentSite } from "@/lib/site-context";
import { getEtsyTool } from "@/lib/etsy-product-data";
import { getEtsyAffiliateUrl } from "@/lib/etsy-affiliate-links";
import { ProductCardCta } from "../../components/product-card-client";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../../components/json-ld";

export const revalidate = 60;

const COMPARISONS: Record<string, [string, string]> = {
  "everbee-vs-alura": ["everbee", "alura"],
  "kittl-vs-canva": ["kittl", "canva"],
};

export async function generateStaticParams() {
  return Object.keys(COMPARISONS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pair = COMPARISONS[slug];
  const site = await getCurrentSite();
  if (!pair) return { title: "Not Found" };
  const a = getEtsyTool(pair[0]);
  const b = getEtsyTool(pair[1]);
  if (!a || !b) return { title: "Not Found" };
  const title = `${a.name} vs ${b.name} for Etsy Sellers (2026) — ${site.name}`;
  const description = `Compare ${a.name} and ${b.name} pricing, features, and best use cases for Etsy print-on-demand and digital-product sellers.`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: `https://${site.domain}/comparison/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/comparison/${slug}`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

function formatCurrency(n: number | null): string {
  if (n === null) return "Custom";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const pair = COMPARISONS[slug];
  if (!pair) notFound();
  const a = getEtsyTool(pair[0]);
  const b = getEtsyTool(pair[1]);
  if (!a || !b) notFound();

  const aUrl = getEtsyAffiliateUrl(a.slug);
  const bUrl = getEtsyAffiliateUrl(b.slug);

  const orgJsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Comparisons", path: "/comparison" },
    { name: `${a.name} vs ${b.name}`, path: `/comparison/${slug}` },
  ]);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${a.name} vs ${b.name}`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Product",
          name: a.name,
          description: a.tagline,
          url: aUrl,
          offers: a.paidPlans
            .filter((p) => p.monthly !== null && p.monthly > 0)
            .slice(0, 1)
            .map((p) => ({
              "@type": "Offer",
              price: p.monthly,
              priceCurrency: "USD",
              priceValidUntil: "2026-12-31",
            })),
        },
      },
      {
        "@type": "ListItem",
        position: 2,
        item: {
          "@type": "Product",
          name: b.name,
          description: b.tagline,
          url: bUrl,
          offers: b.paidPlans
            .filter((p) => p.monthly !== null && p.monthly > 0)
            .slice(0, 1)
            .map((p) => ({
              "@type": "Offer",
              price: p.monthly,
              priceCurrency: "USD",
              priceValidUntil: "2026-12-31",
            })),
        },
      },
    ],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <JsonLd data={orgJsonLd} />
      <JsonLd data={breadcrumbs} />
      <JsonLd data={itemListJsonLd} />

      <header className="mb-10">
        <div className="text-sm font-medium uppercase tracking-wide text-gray-500">Comparison</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {a.name} vs {b.name} for Etsy sellers
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-gray-600">
          Side-by-side pricing and feature comparison for Etsy print-on-demand and digital-product
          sellers. We have not completed a paid hands-on test yet — this page uses public pricing
          and feature data with source links.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                Feature
              </th>
              <th scope="col" className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                {a.name}
              </th>
              <th scope="col" className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                {b.name}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-700">Best for</td>
              <td className="px-6 py-4 text-sm text-gray-600">{a.bestFor}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{b.bestFor}</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-700">Free plan</td>
              <td className="px-6 py-4 text-sm text-gray-600">{a.freePlan}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{b.freePlan}</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-700">Paid plans</td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {a.paidPlans.map((p) => (
                  <div key={p.name}>
                    {p.name}: {formatCurrency(p.monthly)}/mo or {formatCurrency(p.annual)}/yr
                    {p.note ? <span className="block text-xs text-gray-500">{p.note}</span> : null}
                  </div>
                ))}
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {b.paidPlans.map((p) => (
                  <div key={p.name}>
                    {p.name}: {formatCurrency(p.monthly)}/mo or {formatCurrency(p.annual)}/yr
                    {p.note ? <span className="block text-xs text-gray-500">{p.note}</span> : null}
                  </div>
                ))}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-700">Key features</td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <ul className="list-disc space-y-1 pl-4">
                  {a.keyFeatures.slice(0, 4).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <ul className="list-disc space-y-1 pl-4">
                  {b.keyFeatures.slice(0, 4).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-sm font-medium text-gray-700">Limitations</td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <ul className="list-disc space-y-1 pl-4">
                  {a.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                <ul className="list-disc space-y-1 pl-4">
                  {b.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">{a.name}</h2>
          <p className="mt-2 text-sm text-gray-600">{a.tagline}</p>
          <ProductCardCta
            href={aUrl}
            slug={a.slug}
            sourceType="comparison"
            placement={`comparison-${slug}`}
            campaign="etsy-comparison"
            label={`Try ${a.name}`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          />
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">{b.name}</h2>
          <p className="mt-2 text-sm text-gray-600">{b.tagline}</p>
          <ProductCardCta
            href={bUrl}
            slug={b.slug}
            sourceType="comparison"
            placement={`comparison-${slug}`}
            campaign="etsy-comparison"
            label={`Try ${b.name}`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          />
        </div>
      </div>

      <section className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Need to model the cost first?</h2>
        <p className="mt-2 text-sm text-gray-600">
          Plug any of these prices into the calculator to see how many sales it takes to cover the
          tool cost.
        </p>
        <Link
          href="/tools/etsy-profit-calculator"
          className="mt-4 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
        >
          Open the profit calculator
        </Link>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
        <ul className="mt-4 space-y-2 text-sm text-gray-600">
          {[...a.sources, ...b.sources].map((s, i) => (
            <li key={i}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
