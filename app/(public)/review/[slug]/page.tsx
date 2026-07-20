import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentSite } from "@/lib/site-context";
import { getEtsyTool } from "@/lib/etsy-product-data";
import { getEtsyAffiliateUrl } from "@/lib/etsy-affiliate-links";
import { ProductCardCta } from "../../components/product-card-client";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd, faqJsonLd } from "../../components/json-ld";

export const revalidate = 60;

const REVIEWS: Record<
  string,
  {
    slug: string;
    title: string;
    pageTitle: string;
    productSlug: string;
    faq: { q: string; a: string }[];
  }
> = {
  "is-everbee-worth-it-for-new-shop": {
    slug: "is-everbee-worth-it-for-new-shop",
    title: "Is EverBee Worth It for a New Etsy Shop?",
    pageTitle: "Is EverBee Worth It for a New Etsy Shop? (2026 Buying Guide)",
    productSlug: "everbee",
    faq: [
      {
        q: "Can I use EverBee for free?",
        a: "Yes. EverBee offers a Hobby plan with limited keyword results, analytics views, and favorites. No credit card is required to start.",
      },
      {
        q: "When should a new shop upgrade from the free plan?",
        a: "Consider upgrading once you are listing consistently and need unlimited keyword research, the tag analyzer, or trends data to guide restocks.",
      },
      {
        q: "Does EverBee guarantee sales?",
        a: "No. EverBee provides research data and estimates. Sales still depend on your design, listing quality, pricing, reviews, and marketing.",
      },
      {
        q: "What is the break-even point for EverBee Growth?",
        a: "At $19.99/month, one extra sale per month above your current baseline usually covers the cost if your profit per item is $20 or more. Use the profit calculator to model your exact numbers.",
      },
    ],
  },
};

export async function generateStaticParams() {
  return Object.keys(REVIEWS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const review = REVIEWS[slug];
  const site = await getCurrentSite();
  if (!review) return { title: "Not Found" };
  const product = getEtsyTool(review.productSlug);
  if (!product) return { title: "Not Found" };
  const title = `${review.pageTitle} | ${site.name}`;
  const description = `Objective buying guide for ${product.name}. We compare the free and paid plans, break down the break-even math, and explain when a new Etsy shop should upgrade.`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: `https://${site.domain}/review/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/review/${slug}`,
      siteName: site.name,
      locale: site.locale,
      type: "article",
    },
  };
}

function formatCurrency(n: number | null): string {
  if (n === null) return "Custom";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const review = REVIEWS[slug];
  if (!review) notFound();

  const product = getEtsyTool(review.productSlug);
  if (!product) notFound();

  const productUrl = getEtsyAffiliateUrl(product.slug);
  const published = "2026-07-20";
  const modified = "2026-07-20";

  const faqHtml = review.faq.map(({ q, a }) => `<h3>${q}</h3><p>${a}</p>`).join("");

  const orgJsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Reviews", path: "/review" },
    { name: review.title, path: `/review/${slug}` },
  ]);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: review.pageTitle,
    description: `Objective buying guide for ${product.name} for new Etsy shops.`,
    datePublished: published,
    dateModified: modified,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name, url: `https://${site.domain}` },
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://${site.domain}/review/${slug}` },
    inLanguage: site.language,
  };

  const faqJson = faqJsonLd(faqHtml);

  const lowestPaidMonthly = product.paidPlans
    .map((p) => p.monthly)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)[0];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={orgJsonLd} />
      <JsonLd data={breadcrumbs} />
      <JsonLd data={articleJsonLd} />
      {faqJson && <JsonLd data={faqJson} />}

      <article>
        <header className="mb-8">
          <div className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Review / buying guide
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {review.pageTitle}
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            A data-first look at whether {product.name} makes sense for a new Etsy shop. We have not
            completed a paid, hands-on test yet; this guide uses official pricing, free-plan limits,
            and a break-even calculation.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>
              Published: <time dateTime={published}>{published}</time>
            </span>
            <span>
              Updated: <time dateTime={modified}>{modified}</time>
            </span>
          </div>
        </header>

        <div className="mb-8 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {site.contentDisclosure}
        </div>

        <section className="prose prose-lg max-w-none">
          <h2>What {product.name} does</h2>
          <p>{product.tagline}</p>
          <ul>
            {product.keyFeatures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>

          <h2>The free plan is enough to start</h2>
          <p>
            {product.freePlan} For a brand-new shop, that is usually enough to validate a few niches
            and see whether your first listings get traction before spending money.
          </p>

          <h2>When to consider the paid plan</h2>
          <ul>
            <li>You are listing consistently (roughly 10+ active listings).</li>
            <li>You need unlimited keyword research to optimize titles and tags.</li>
            <li>You want sales estimates and trend data to guide restocks or new designs.</li>
            <li>You are connecting multiple shops or want priority support.</li>
          </ul>

          <h2>Break-even math</h2>
          <p>
            The cheapest paid plan is {formatCurrency(lowestPaidMonthly ?? null)}/month. If your
            average profit per sale is $10, you need roughly{" "}
            {Math.ceil((lowestPaidMonthly ?? 0) / 10)} extra sales per month to break even. At $20
            profit per sale, you need {Math.ceil((lowestPaidMonthly ?? 0) / 20)}. Use the{" "}
            <Link
              href="/tools/etsy-profit-calculator"
              className="underline"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              profit calculator
            </Link>{" "}
            with your real numbers.
          </p>

          <h2>Verdict for new shops</h2>
          <p>
            Start with the free plan. If you are serious about scaling, the paid plan pays for
            itself with a small number of additional sales, but only if you actually act on the
            research. Do not buy it as a shortcut before you have listings and a workflow.
          </p>
        </section>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900">Try {product.name}</h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign up for the free plan and test the keyword research workflow before paying. If you
            upgrade later, we may earn a commission.
          </p>
          <ProductCardCta
            href={productUrl}
            slug={product.slug}
            sourceType="review"
            placement={`review-${slug}`}
            campaign="etsy-review"
            label={`Start with ${product.name} free`}
            className="mt-4 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          />
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-gray-900">Sources</h2>
          <ul className="mt-4 space-y-2 text-sm text-gray-600">
            {product.sources.map((s, i) => (
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

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-gray-900">FAQ</h2>
          <div className="mt-4 space-y-6">
            {review.faq.map(({ q, a }) => (
              <div key={q}>
                <h3 className="text-lg font-medium text-gray-900">{q}</h3>
                <p className="mt-1 text-gray-600">{a}</p>
              </div>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
