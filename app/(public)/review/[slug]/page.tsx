import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import {
  getEtsyReview,
  getAllEtsyReviewSlugs,
  getEtsyTool,
  formatCurrencyUSD,
} from "@/lib/etsy-product-data";
import { getProductUrl, isAffiliateLinkReady } from "@/lib/etsy-affiliate-links";
import { HtmlRenderer } from "../../components/html-renderer";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd, faqJsonLd } from "../../components/json-ld";
import { ProductCardCta } from "../../components/product-card-client";
import Link from "next/link";
import ContentPage, {
  generateMetadata as generateContentMetadata,
} from "../../[slug]/[nestedSlug]/page";
import { isExcludedCompareaiSlug } from "@/lib/compareai-cleanup";

export const revalidate = 60;

function buildFaqHtml(faq: { question: string; answer: string }[]): string {
  return faq.map((f) => `<h2>${f.question}</h2><p>${f.answer}</p>`).join("");
}

export async function generateStaticParams() {
  return getAllEtsyReviewSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const review = getEtsyReview(slug);
  const site = await getCurrentSite();
  if (site.slug !== "ai-compared" || !review) {
    if (site.slug === "ai-compared" && isExcludedCompareaiSlug(slug)) {
      notFound();
    }
    return generateContentMetadata({
      params: Promise.resolve({ slug: "review", nestedSlug: slug }),
      searchParams: Promise.resolve({}),
    });
  }
  const url = `https://${site.domain}/review/${review.slug}`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: review.metaTitle,
    description: review.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: review.metaTitle,
      description: review.metaDescription,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "article",
      publishedTime: review.datePublished,
      modifiedTime: review.dateModified,
    },
  };
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const review = getEtsyReview(slug);
  const site = await getCurrentSite();
  if (site.slug !== "ai-compared" || !review) {
    if (site.slug === "ai-compared" && isExcludedCompareaiSlug(slug)) {
      notFound();
    }
    return (
      <ContentPage
        params={Promise.resolve({ slug: "review", nestedSlug: slug })}
        searchParams={Promise.resolve({})}
      />
    );
  }

  const tool = getEtsyTool(review.toolSlug);
  if (!tool) notFound();

  const url = `https://${site.domain}/review/${review.slug}`;
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Reviews", path: "/review" },
    { name: review.title, path: `/review/${review.slug}` },
  ]);

  const paidPlan = tool.pricing.find((p) => p.monthlyUsd && p.monthlyUsd > 0) ??
    tool.pricing[0] ?? {
      name: "Free",
      monthlyUsd: 0,
      annualUsd: null,
      annualTotalUsd: null,
      features: [],
    };
  const faqHtml = buildFaqHtml(review.faq);
  const faqJson = faqJsonLd(faqHtml);

  const { pricePerUnit, productionCost, monthlyOverhead, etsyFeesPercent } =
    review.breakEvenAssumptions;
  const etsyFeePerUnit = pricePerUnit * (etsyFeesPercent / 100);
  const profitPerUnit = pricePerUnit - productionCost - etsyFeePerUnit;
  const breakEvenUnits = Math.ceil(paidPlan.monthlyUsd ? paidPlan.monthlyUsd / profitPerUnit : 0);
  const breakEvenUnitsAnnual = Math.ceil(
    paidPlan.annualUsd ? paidPlan.annualUsd / profitPerUnit : 0,
  );

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: review.title,
    description: review.metaDescription,
    datePublished: review.datePublished,
    dateModified: review.dateModified,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name, url: `https://${site.domain}` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: site.language,
  };

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: tool.name,
    description: tool.tagline,
    url: `https://${site.domain}/review/${review.slug}`,
    offers: {
      "@type": "Offer",
      price: paidPlan.monthlyUsd ?? 0,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: getProductUrl(tool.slug),
    },
  };

  const reviewJsonLd = {
    "@context": "https://schema.org",
    "@type": "Review",
    headline: review.title,
    description: review.verdictHeadline,
    datePublished: review.datePublished,
    dateModified: review.dateModified,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name, url: `https://${site.domain}` },
    itemReviewed: productJsonLd,
    inLanguage: site.language,
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={articleJsonLd} />
      <JsonLd data={reviewJsonLd} />
      <JsonLd data={productJsonLd} />
      {faqJson && <JsonLd data={faqJson} />}

      <article>
        <header className="mb-8">
          <div className="text-sm font-medium uppercase tracking-wide text-gray-500">Review</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {review.title}
          </h1>
          <p className="mt-4 text-lg text-gray-600">{review.metaDescription}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>
              Published: <time dateTime={review.datePublished}>{review.datePublished}</time>
            </span>
            <span>
              Updated: <time dateTime={review.dateModified}>{review.dateModified}</time>
            </span>
          </div>
        </header>

        <div className="mb-8 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {site.contentDisclosure}
        </div>

        <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">Verdict</h2>
          <p className="mt-2 font-medium text-gray-900">{review.verdictHeadline}</p>
          <p className="mt-2 text-gray-600">{review.verdictBody}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900">Pricing and plans</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tool.pricing.map((plan) => (
              <div key={plan.name} className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {formatCurrencyUSD(plan.monthlyUsd ?? 0)}
                  <span className="text-sm font-normal text-gray-500">/mo</span>
                </p>
                {plan.annualUsd && plan.annualUsd !== plan.monthlyUsd ? (
                  <p className="text-xs text-gray-500">
                    {formatCurrencyUSD(plan.annualUsd)}/mo billed annually
                    {plan.annualTotalUsd ? ` (${formatCurrencyUSD(plan.annualTotalUsd)}/yr)` : ""}
                  </p>
                ) : null}
                <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-gray-600">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">Break-even calculation</h2>
          <p className="mt-2 text-sm text-gray-600">{review.breakEvenAssumptions.note}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Price per unit</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrencyUSD(pricePerUnit)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Production cost</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrencyUSD(productionCost)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase text-gray-500">Etsy fees</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrencyUSD(etsyFeePerUnit)}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-600">
              Estimated profit per unit:{" "}
              <span className="font-semibold text-gray-900">
                {formatCurrencyUSD(profitPerUnit)}
              </span>
            </p>
            {paidPlan.monthlyUsd ? (
              <p className="mt-2 text-sm text-gray-600">
                To cover {tool.name} {paidPlan.name} ({formatCurrencyUSD(paidPlan.monthlyUsd)}/mo
                monthly): sell at least{" "}
                <span className="font-semibold text-gray-900">{breakEvenUnits} units</span> per
                month.
              </p>
            ) : null}
            {paidPlan.annualUsd ? (
              <p className="text-sm text-gray-600">
                On annual billing ({formatCurrencyUSD(paidPlan.annualUsd)}/mo), that drops to{" "}
                <span className="font-semibold text-gray-900">{breakEvenUnitsAnnual} units</span>{" "}
                per month.
              </p>
            ) : null}
          </div>
        </section>

        <section className="mb-10 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Pros</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-600">
              {tool.pros.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Cons</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-600">
              {tool.cons.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900">Who should use {tool.name}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-600">
            {tool.bestFor.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900">Official sources</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
            {tool.officialSources.map((source) => (
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

        <section className="mb-10 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">Try {tool.name}</h2>
            <p className="text-sm text-gray-600">
              {isAffiliateLinkReady(tool.slug)
                ? "Use our affiliate link to support the site at no extra cost."
                : "We do not have an affiliate link yet; this goes to the official site."}
            </p>
          </div>
          <ProductCardCta
            href={getProductUrl(tool.slug)}
            slug={tool.slug}
            sourceType="review"
            placement={review.slug}
            productName={tool.name}
            label={isAffiliateLinkReady(tool.slug) ? `Get ${tool.name}` : `Visit ${tool.name}`}
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          />
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900">Frequently asked questions</h2>
          <div className="mt-4">
            <HtmlRenderer html={faqHtml} direction={site.direction} />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">Model your own numbers</h2>
          <p className="mt-2 text-sm text-gray-600">
            Use the free calculator to plug in your price, cost, fees and tool subscription and see
            exactly how many units you need to sell.
          </p>
          <div className="mt-4">
            <Link
              href="/tools/etsy-profit-calculator"
              className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
            >
              Open the profit calculator
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
