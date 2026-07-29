import Link from "next/link";
import {
  Search,
  PenTool,
  ListChecks,
  Calculator,
  BookOpen,
  ArrowLeftRight,
  Layers,
  FileText,
  Mail,
  ArrowRight,
} from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow } from "@/types/database";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import { etsyTools } from "@/lib/etsy-product-data";
import { EtsyToolCard } from "./etsy-tool-card";
import { getAllSiteGuides } from "@/lib/site-guides";
import { filterExcludedCompareaiContent } from "@/lib/compareai-cleanup";

interface EtsyHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
}

export function EtsyHomepage({ site, recentContent }: EtsyHomepageProps) {
  const workflow = [
    {
      title: "Research",
      body: "Find low-competition listings and trending product ideas with marketplace data.",
      icon: Search,
    },
    {
      title: "Design",
      body: "Create designs, mockups, and variations with commercial-safe AI tools.",
      icon: PenTool,
    },
    {
      title: "List",
      body: "Optimize titles, tags, and disclosures so your listings are found and trusted.",
      icon: ListChecks,
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
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Hero: one specific promise */}
      <section
        className="relative overflow-hidden bg-cover bg-center"
        style={{
          backgroundColor: "var(--color-primary, #0B1120)",
          backgroundImage:
            "linear-gradient(to right, rgba(11,17,32,0.95) 0%, rgba(11,17,32,0.80) 45%, rgba(11,17,32,0.40) 100%), url(/images/compareai/compareai-hero-home.jpg)",
        }}
      >
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28 lg:px-8">
          <p
            className="mb-5 font-mono text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--color-accent-light, #3B82F6)" }}
          >
            AI-POWERED ETSY WORKFLOWS
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white md:text-5xl lg:text-6xl">
            Find the right AI stack for your Etsy shop.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            Honest reviews, side-by-side comparisons, and practical workflows for print-on-demand
            and digital-product sellers. No AI hype. No guaranteed-income promises.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/tools/etsy-profit-calculator"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-[var(--color-accent,#2D6BF0)] px-6 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <Calculator className="h-5 w-5" aria-hidden="true" />
              Free profit calculator
            </Link>
            <Link
              href="/guide"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-white/15 px-6 text-base font-semibold text-white transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <BookOpen className="h-5 w-5" aria-hidden="true" />
              Browse tutorials
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs text-gray-400">
            <span className="text-white/80">Hand-tested tools</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              Official policy citations
            </span>
            <span>No pay-for-rank</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Workflow strip */}
        <section className="py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              The workflow we cover
            </h2>
            <p className="mt-2 text-base text-slate-600">
              Every guide and comparison is organized around the same three-step loop.
            </p>
          </div>
          <div className="relative mt-10">
            <div
              className="absolute top-8 left-[8%] right-[8%] hidden h-0.5 bg-slate-200 md:block"
              aria-hidden="true"
            />
            <div className="relative grid gap-10 md:grid-cols-3">
              {workflow.map((step, i) => {
                const Icon = step.icon;
                const isFirst = i === 0;
                return (
                  <div key={step.title} className="relative flex flex-col md:items-center">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 bg-white shadow-sm"
                      style={{
                        borderColor: isFirst ? "var(--color-accent, #2D6BF0)" : "#e2e8f0",
                      }}
                    >
                      <Icon
                        className="h-6 w-6"
                        style={{
                          color: isFirst ? "var(--color-accent, #2D6BF0)" : "#475569",
                        }}
                      />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-slate-900 md:text-center">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 md:text-center">
                      {step.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Featured tools */}
        <section className="border-t border-slate-100 py-16">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers
                className="h-5 w-5"
                style={{ color: "var(--color-accent, #2D6BF0)" }}
                aria-hidden="true"
              />
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  Tools we cover
                </h2>
                <p className="mt-1 text-base text-slate-600">
                  Research, design, listing, and POD tools we test and compare.
                </p>
              </div>
            </div>
            <Link
              href="/tools"
              className="hidden items-center gap-1 text-sm font-semibold transition-colors hover:underline sm:inline-flex"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {toolList.map((tool) => (
              <EtsyToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
          <div className="mt-6 sm:hidden">
            <Link
              href="/tools"
              className="inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:underline"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              View all tools
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* Hub cards */}
        <section className="border-t border-slate-100 py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Start here</h2>
            <p className="mt-2 text-base text-slate-600">
              Pick the resource that matches your current goal.
            </p>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {hubs.map((hub) => {
              const Icon = hub.icon;
              return (
                <Link
                  key={hub.href}
                  href={hub.href}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                    <Icon
                      className="h-6 w-6"
                      style={{ color: "var(--color-accent, #2D6BF0)" }}
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">{hub.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{hub.body}</p>
                  <span
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold transition-colors group-hover:underline"
                    style={{ color: "var(--color-accent-text, var(--color-accent))" }}
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
        </section>

        {/* Latest guides (DB-driven) */}
        {latestGuides.length > 0 && (
          <section className="border-t border-slate-100 py-16">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen
                  className="h-5 w-5"
                  style={{ color: "var(--color-accent, #2D6BF0)" }}
                  aria-hidden="true"
                />
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  Latest guides
                </h2>
              </div>
              <Link
                href="/guide"
                className="inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:underline"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {latestGuides.map((content) => (
                <Link
                  key={content.id}
                  href={`/${content.type}/${content.slug}`}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
                >
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    {content.type}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900 group-hover:underline">
                    {content.title}
                  </h3>
                  {content.excerpt && (
                    <p className="mt-2 text-sm text-slate-600 line-clamp-3">{content.excerpt}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Email capture + disclosure */}
        <section className="border-t border-slate-100 py-16">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 lg:grid lg:grid-cols-2 lg:gap-8">
            <div>
              <p
                className="font-mono text-xs uppercase tracking-[0.2em]"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                Free lead magnet
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Get the Etsy AI Workflow Checklist
              </h2>
              <p className="mt-2 text-base text-slate-600">
                A printable checklist covering research, design, listing, and disclosure — plus a
                list of the first tools to test.
              </p>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>Product-research routine you can repeat weekly</li>
                <li>AI disclosure and mockup compliance checks</li>
                <li>Title/tag optimization before publishing</li>
              </ul>
            </div>
            <div className="mt-6 flex flex-col justify-center lg:mt-0">
              <Link
                href="/newsletter"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent,#2D6BF0)] px-6 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Mail className="h-5 w-5" aria-hidden="true" />
                Get the checklist
              </Link>
              <p className="mt-3 text-center text-xs text-slate-500 lg:text-left">
                We&apos;ll email you the checklist and occasional updates. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </section>

        {/* Affiliate transparency */}
        <section className="pb-20 pt-6">
          <div
            className="rounded-xl border-l-4 border-slate-200 bg-slate-50 p-6 sm:p-8"
            style={{ borderLeftColor: "var(--color-accent, #2D6BF0)" }}
          >
            <p
              className="font-mono text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              Disclosure
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
              How we make money
            </h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
              We earn an affiliate commission when you sign up through some links. That never
              changes a score or a ranking — our methodology is fixed and public.
            </p>
            <Link
              href="/affiliate-disclosure"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:underline"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              Read our full disclosure
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
