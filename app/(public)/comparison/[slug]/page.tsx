import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import {
  getEtsyComparison,
  getAllEtsyComparisonSlugs,
  getEtsyTool,
  formatCurrencyUSD,
  type EtsyTool,
  type EtsyToolPlan,
} from "@/lib/etsy-product-data";
import { getProductUrl, isAffiliateLinkReady } from "@/lib/etsy-affiliate-links";
import { HtmlRenderer } from "../../components/html-renderer";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd, faqJsonLd } from "../../components/json-ld";
import { ProductCardCta } from "../../components/product-card-client";
import Link from "next/link";

export const revalidate = 60;

function buildFaqHtml(faq: { question: string; answer: string }[]): string {
  return faq.map((f) => `<h2>${f.question}</h2><p>${f.answer}</p>`).join("");
}

function cheapestPaidPlan(tool: EtsyTool): EtsyToolPlan {
  const paid = tool.pricing.find((p) => p.monthlyUsd && p.monthlyUsd > 0);
  if (paid) return paid;
  return (
    tool.pricing[0] ?? {
      name: "Free",
      monthlyUsd: 0,
      annualUsd: null,
      annualTotalUsd: null,
      features: [],
    }
  );
}

export async function generateStaticParams() {
  return getAllEtsyComparisonSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const comparison = getEtsyComparison(slug);
  const site = await getCurrentSite();
  if (site.slug !== "ai-compared" || !comparison) {
    return { title: "Not Found" };
  }
  const url = `https://${site.domain}/comparison/${comparison.slug}`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: comparison.metaTitle,
    description: comparison.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: comparison.metaTitle,
      description: comparison.metaDescription,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "article",
      publishedTime: comparison.datePublished,
      modifiedTime: comparison.dateModified,
    },
  };
}

export default async function ComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comparison = getEtsyComparison(slug);
  const site = await getCurrentSite();
  if (site.slug !== "ai-compared" || !comparison) notFound();

  const left = getEtsyTool(comparison.leftToolSlug);
  const right = getEtsyTool(comparison.rightToolSlug);
  if (!left || !right) notFound();

  const url = `https://${site.domain}/comparison/${comparison.slug}`;
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Comparisons", path: "/comparison" },
    { name: comparison.title, path: `/comparison/${comparison.slug}` },
  ]);

  const leftPlan = cheapestPaidPlan(left);
  const rightPlan = cheapestPaidPlan(right);
  const faqHtml = buildFaqHtml(comparison.faq);
  const faqJson = faqJsonLd(faqHtml);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: comparison.title,
    description: comparison.metaDescription,
    datePublished: comparison.datePublished,
    dateModified: comparison.dateModified,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name, url: `https://${site.domain}` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: site.language,
  };

  const leftProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: left.name,
    description: left.tagline,
    url: `https://${site.domain}/comparison/${comparison.slug}#${left.slug}`,
    offers: {
      "@type": "Offer",
      price: leftPlan.monthlyUsd ?? 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: getProductUrl(left.slug),
    },
  };

  const rightProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: right.name,
    description: right.tagline,
    url: `https://${site.domain}/comparison/${comparison.slug}#${right.slug}`,
    offers: {
      "@type": "Offer",
      price: rightPlan.monthlyUsd ?? 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: getProductUrl(right.slug),
    },
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={articleJsonLd} />
      <JsonLd data={leftProductJsonLd} />
      <JsonLd data={rightProductJsonLd} />
      {faqJson && <JsonLd data={faqJson} />}

      <article>
        <header className="mb-8">
          <div className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Comparison
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {comparison.title}
          </h1>
          <p className="mt-4 text-lg text-gray-600">{comparison.metaDescription}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>
              Published: <time dateTime={comparison.datePublished}>{comparison.datePublished}</time>
            </span>
            <span>
              Updated: <time dateTime={comparison.dateModified}>{comparison.dateModified}</time>
            </span>
          </div>
        </header>

        <div className="mb-8 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {site.contentDisclosure}
        </div>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900">Quick answer</h2>
          <p className="mt-2 text-gray-600">
            {comparison.verdictHeadline} {comparison.verdictBody}
          </p>
        </section>

        <section className="mb-10 overflow-x-auto">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">Side-by-side comparison</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-3 pr-4 text-left font-semibold text-gray-700">Feature</th>
                <th className="py-3 px-4 text-left font-semibold text-gray-900">{left.name}</th>
                <th className="py-3 px-4 text-left font-semibold text-gray-900">{right.name}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium text-gray-600">Best for</td>
                <td className="py-3 px-4 text-gray-700">{left.bestFor.join("; ")}</td>
                <td className="py-3 px-4 text-gray-700">{right.bestFor.join("; ")}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium text-gray-600">Cheapest paid plan</td>
                <td className="py-3 px-4 text-gray-700">
                  {formatCurrencyUSD(leftPlan.monthlyUsd ?? 0)}/mo
                  {leftPlan.annualUsd && leftPlan.annualUsd !== leftPlan.monthlyUsd ? (
                    <span className="block text-xs text-gray-500">
                      or {formatCurrencyUSD(leftPlan.annualUsd)}/mo billed annually
                    </span>
                  ) : null}
                </td>
                <td className="py-3 px-4 text-gray-700">
                  {formatCurrencyUSD(rightPlan.monthlyUsd ?? 0)}/mo
                  {rightPlan.annualUsd && rightPlan.annualUsd !== rightPlan.monthlyUsd ? (
                    <span className="block text-xs text-gray-500">
                      or {formatCurrencyUSD(rightPlan.annualUsd)}/mo billed annually
                    </span>
                  ) : null}
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium text-gray-600">Free plan</td>
                <td className="py-3 px-4 text-gray-700">
                  {left.pricing[0]?.monthlyUsd === 0 ? "Yes" : "No"}
                </td>
                <td className="py-3 px-4 text-gray-700">
                  {right.pricing[0]?.monthlyUsd === 0 ? "Yes" : "No"}
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium text-gray-600">Core strengths</td>
                <td className="py-3 px-4 text-gray-700">{left.keyFeatures.join("; ")}</td>
                <td className="py-3 px-4 text-gray-700">{right.keyFeatures.join("; ")}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium text-gray-600">Affiliate terms</td>
                <td className="py-3 px-4 text-gray-700">
                  {left.slug === "everbee" && "30% recurring for 12 months, 180-day cookie"}
                  {left.slug === "alura" && "30% recurring for up to 6 months, 30-day cookie"}
                  {left.slug === "kittl" && "20% recurring for 12 months"}
                  {left.slug === "canva" && "Contact Canva for current partner terms"}
                </td>
                <td className="py-3 px-4 text-gray-700">
                  {right.slug === "everbee" && "30% recurring for 12 months, 180-day cookie"}
                  {right.slug === "alura" && "30% recurring for up to 6 months, 30-day cookie"}
                  {right.slug === "kittl" && "20% recurring for 12 months"}
                  {right.slug === "canva" && "Contact Canva for current partner terms"}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">
            Prices verified from official sites on {left.lastVerified}. Regional pricing and
            promotions can change; confirm before subscribing.
          </p>
        </section>

        <section className="mb-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">{left.name}</h3>
            <p className="mt-1 text-sm text-gray-600">{left.tagline}</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
              {left.pros.slice(0, 3).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <ProductCardCta
              href={getProductUrl(left.slug)}
              slug={left.slug}
              sourceType="comparison"
              placement={comparison.slug}
              productName={left.name}
              label={isAffiliateLinkReady(left.slug) ? `Get ${left.name}` : `Visit ${left.name}`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">{right.name}</h3>
            <p className="mt-1 text-sm text-gray-600">{right.tagline}</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
              {right.pros.slice(0, 3).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <ProductCardCta
              href={getProductUrl(right.slug)}
              slug={right.slug}
              sourceType="comparison"
              placement={comparison.slug}
              productName={right.name}
              label={isAffiliateLinkReady(right.slug) ? `Get ${right.name}` : `Visit ${right.name}`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
            />
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900">Official sources</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {[...left.officialSources, ...right.officialSources]
              .filter((s, i, arr) => arr.findIndex((t) => t.url === s.url) === i)
              .map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline"
                    style={{ color: "var(--color-accent-text, var(--color-accent))" }}
                  >
                    {source.label}
                  </a>
                </li>
              ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900">Frequently asked questions</h2>
          <div className="mt-4">
            <HtmlRenderer html={faqHtml} direction={site.direction} />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Find the right tool with real numbers
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Before you subscribe, model your profit per sale and see how many units you need to
            break even.
          </p>
          <div className="mt-4">
            <Link
              href="/tools/etsy-profit-calculator"
              className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
            >
              Try the free profit calculator
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
