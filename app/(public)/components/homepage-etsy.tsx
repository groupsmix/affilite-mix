import Image from "next/image";
import Link from "next/link";
import { Calculator, BookOpen, ArrowLeftRight, ArrowRight } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow } from "@/types/database";
import type { EtsyTool } from "@/lib/etsy-product-data";
import {
  etsyTools,
  formatCurrencyUSD,
  getEtsyComparisonsByToolSlug,
  getEtsyReviewByToolSlug,
  getEtsyToolStartingPrice,
} from "@/lib/etsy-product-data";
import { getProductUrl, isAffiliateLinkReady } from "@/lib/etsy-affiliate-links";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import { ProductCardCta } from "./product-card-client";
import { getAllSiteGuides } from "@/lib/site-guides";
import { filterExcludedCompareaiContent } from "@/lib/compareai-cleanup";

interface EtsyHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
}

function ToolRow({ tool }: { tool: EtsyTool }) {
  const review = getEtsyReviewByToolSlug(tool.slug);
  const comparisons = getEtsyComparisonsByToolSlug(tool.slug);
  const startingPrice = getEtsyToolStartingPrice(tool);
  const href = getProductUrl(tool.slug);
  const affiliateReady = isAffiliateLinkReady(tool.slug);

  const priceText =
    startingPrice.monthlyUsd > 0
      ? `${formatCurrencyUSD(startingPrice.monthlyUsd)}/mo · ${startingPrice.name}`
      : "Free";

  return (
    <div className="group flex flex-col gap-4 border-b border-slate-800/50 py-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900/50">
          {tool.logoUrl ? (
            <Image
              src={tool.logoUrl}
              alt=""
              width={40}
              height={40}
              className="h-6 w-auto object-contain"
            />
          ) : (
            <span className="text-sm font-bold text-slate-600">
              {tool.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <h3 className="text-base font-medium text-white">{tool.name}</h3>
          <p className="text-sm text-slate-500">{tool.tagline}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
        <span className="text-sm text-slate-400">{priceText}</span>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <ProductCardCta
            href={href}
            slug={tool.slug}
            sourceType="tool-directory"
            placement="homepage"
            productName={tool.name}
            label={`${affiliateReady ? "Get" : "Visit"} ${tool.name} →`}
            className="text-sm font-medium text-[var(--color-accent-light,#3B82F6)] transition-colors hover:text-white"
          />
          {review && (
            <Link
              href={`/review/${review.slug}`}
              className="text-sm text-slate-500 transition-colors hover:text-white"
            >
              Review
            </Link>
          )}
          {comparisons[0] && (
            <Link
              href={`/comparison/${comparisons[0].slug}`}
              className="text-sm text-slate-500 transition-colors hover:text-white"
            >
              Compare
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function EtsyHomepage({ site, recentContent }: EtsyHomepageProps) {
  const workflow = [
    {
      title: "Research",
      body: "Find low-competition listings and trending product ideas with marketplace data.",
    },
    {
      title: "Design",
      body: "Create designs, mockups, and variations with commercial-safe AI tools.",
    },
    {
      title: "List",
      body: "Optimize titles, tags, and disclosures so your listings are found and trusted.",
    },
  ];

  const hubs = [
    {
      href: "/tools/etsy-profit-calculator",
      title: "Free Etsy Profit Calculator",
      body: "Estimate fees, profit per sale, break-even units, and monthly profit before you list.",
      cta: "Calculate profit",
      icon: Calculator,
    },
    {
      href: "/guide",
      title: "Tutorials & Workflows",
      body: "Step-by-step guides for product research, listing optimization, AI mockups, and POD workflows.",
      cta: "Browse guides",
      icon: BookOpen,
    },
    {
      href: "/comparison",
      title: "Honest Comparisons",
      body: "EverBee vs Alura, Kittl vs Canva, and other tool showdowns built on hands-on testing.",
      cta: "See comparisons",
      icon: ArrowLeftRight,
    },
  ];

  const toolList = Object.values(etsyTools).slice(0, 4);

  const filteredDb = filterExcludedCompareaiContent(recentContent).slice(0, 3);
  const latestGuides: ContentRow[] = [...filteredDb];
  if (latestGuides.length < 3) {
    const needed = 3 - latestGuides.length;
    const existingSlugs = new Set(latestGuides.map((c) => c.slug));
    const staticGuides = getAllSiteGuides(site.slug ?? site.id)
      .filter((g) => !existingSlugs.has(g.slug))
      .slice(0, needed)
      .map((g) => ({
        id: g.slug,
        site_id: site.id,
        title: g.title,
        slug: g.slug,
        body: g.bodyHtml,
        excerpt: g.excerpt,
        featured_image: "",
        type: "guide" as ContentRow["type"],
        status: "published" as ContentRow["status"],
        category_id: null,
        tags: g.tags,
        author: null,
        publish_at: g.datePublished,
        meta_title: g.metaTitle,
        meta_description: g.metaDescription,
        og_image: null,
        body_previous: null,
        review_state: "published" as ContentRow["review_state"],
        created_at: g.datePublished,
        updated_at: g.dateModified,
      }));
    latestGuides.push(...staticGuides);
  }

  return (
    <div
      className="min-h-screen text-slate-300"
      style={{ backgroundColor: "var(--color-primary, #0B1120)" }}
    >
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <p
          className="mb-5 text-xs font-medium uppercase tracking-widest"
          style={{ color: "var(--color-accent-light, #3B82F6)" }}
        >
          AI-powered Etsy workflows
        </p>
        <h1 className="max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tighter text-white sm:text-6xl md:text-7xl">
          Find the right AI stack for your Etsy shop.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          Honest reviews, side-by-side comparisons, and practical workflows for print-on-demand and
          digital-product sellers. No AI hype. No guaranteed-income promises.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link
            href="/tools/etsy-profit-calculator"
            className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          >
            <Calculator className="h-4 w-4" aria-hidden="true" />
            Free profit calculator
          </Link>
          <Link
            href="/tools"
            className="group inline-flex items-center gap-1 text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            Compare tools
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>

        <p className="mt-12 text-xs text-slate-600">
          Hand-tested tools · Official policy citations · No pay-for-rank
        </p>
      </section>

      <section className="border-t border-slate-800/50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {workflow.map((step, i) => (
              <div key={step.title} className="flex gap-4">
                <span
                  className="font-mono text-sm"
                  style={{ color: "var(--color-accent, #2D6BF0)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-sm font-medium text-white">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Tools we cover</h2>
              <p className="mt-1 text-sm text-slate-500">
                Research, design, listing, and POD tools we test and compare.
              </p>
            </div>
            <Link
              href="/tools"
              className="hidden items-center gap-1 text-sm font-medium text-slate-400 transition-colors hover:text-white sm:inline-flex"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-8 border-t border-slate-800/50">
            {toolList.map((tool) => (
              <ToolRow key={tool.slug} tool={tool} />
            ))}
          </div>

          <div className="mt-6 sm:hidden">
            <Link
              href="/tools"
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 transition-colors hover:text-white"
            >
              View all tools
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {latestGuides.length > 0 && (
        <section className="border-t border-slate-800/50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Latest guides</h2>
            <div className="mt-8 divide-y divide-slate-800/50 border-t border-slate-800/50">
              {latestGuides.map((content) => (
                <Link
                  key={content.id}
                  href={`/${content.type}/${content.slug}`}
                  className="group flex flex-col gap-1 py-5"
                >
                  <h3 className="text-base font-medium text-white transition-colors group-hover:text-[var(--color-accent-light,#3B82F6)]">
                    {content.title}
                  </h3>
                  {content.excerpt && (
                    <p className="text-sm text-slate-600 line-clamp-2">{content.excerpt}</p>
                  )}
                </Link>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href="/guide"
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 transition-colors hover:text-white"
              >
                View all guides
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-slate-800/50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Start here</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {hubs.map((hub) => {
              const Icon = hub.icon;
              return (
                <Link
                  key={hub.href}
                  href={hub.href}
                  className="group block rounded-lg border border-slate-800/50 p-5 transition-colors hover:border-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <h3 className="text-sm font-medium text-white">{hub.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{hub.body}</p>
                  <span
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium transition-colors group-hover:underline"
                    style={{ color: "var(--color-accent-light, #3B82F6)" }}
                  >
                    {hub.cta}
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
