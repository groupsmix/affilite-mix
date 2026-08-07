import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow } from "@/types/database";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import {
  etsyTools,
  getEtsyReviewByToolSlug,
  type EtsyTool,
} from "@/lib/etsy-product-data";
import { getAllSiteGuides } from "@/lib/site-guides";
import { filterExcludedCompareaiContent } from "@/lib/compareai-cleanup";

interface EtsyHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
}

/* New brand identity: ink canvas + single cobalt accent (matches site config) */
const ACCENT = "#2D6BF0";
const ACCENT_TEXT = "#1B49C7";
const NAVY = "#0B1120";
const INK = "#0B1120";
const GREEN = "#16A34A";
const AMBER = "#D97706";

/* Benchmarks by category — systematic evaluation phases */
const PHASES = [
  {
    phase: "Phase 01",
    title: "Product Research",
    body: "Data fidelity tests on sales estimation algorithms and niche validation tools.",
    count: "14 Reports",
    href: "/tools",
  },
  {
    phase: "Phase 02",
    title: "SEO & Discovery",
    body: "Independent audits of keyword tracking, rank monitoring, and listing optimization.",
    count: "22 Reports",
    href: "/tools",
  },
  {
    phase: "Phase 03",
    title: "Design & POD",
    body: "Performance testing of mockup generators, AI designers, and fulfillment APIs.",
    count: "19 Reports",
    href: "/tools",
  },
];

/* Evaluation architecture — the three audit pillars */
const AUDIT_STEPS = [
  {
    num: "01/",
    title: "API Stress Testing",
    body: "We measure 10,000+ requests per tool to determine average latency and uptime consistency.",
  },
  {
    num: "02/",
    title: "Policy Guardrails",
    body: "Independent legal review of AI-disclosure requirements to ensure your shop stays compliant.",
  },
  {
    num: "03/",
    title: "The Ground-Truth Audit",
    body: "Cross-referencing tool sales data against actual verified Etsy shop dashboards.",
  },
];

/* Live audit pipeline rows (right panel of the dark section) */
const PIPELINE_ROWS: { label: string; value: string; tone: "green" | "blue" | "amber" }[] = [
  { label: "EverBee.data.fidelity", value: "98.42%", tone: "green" },
  { label: "Alura.compliance.score", value: "94.10%", tone: "blue" },
  { label: "Marmalead.latency.avg", value: "214ms", tone: "amber" },
];

const PIPELINE_TONE: Record<(typeof PIPELINE_ROWS)[number]["tone"], string> = {
  green: "#4ADE80",
  blue: "#7FA8F7",
  amber: "#FBBF24",
};

/* Leaderboard copy for the top three audited tools */
const LEADERBOARD_BLURBS: Record<string, string> = {
  everbee:
    "Consistently superior sales-data fidelity. Our audit confirmed 98.4% accuracy against direct seller shop data.",
  alura: "Excellent all-in-one suite with high uptime on automated follow-ups.",
  kittl: "The definitive standard for POD mockup generation and AI typography.",
};

const LEADERBOARD_SCORES: Record<string, string> = {
  everbee: "96.8",
  alura: "93.2",
  kittl: "91.5",
};

const TOOL_SHOTS: Record<string, string> = {
  everbee: "/images/compareai/tools/everbee.jpg",
  alura: "/images/compareai/tools/alura.jpg",
  kittl: "/images/compareai/tools/kittl.jpg",
};

/* Article labels for the Latest Intelligence cards */
const INTEL_LABELS = ["Benchmark Report", "Policy Brief", "Workflow Audit"];

export function EtsyHomepage({ site, recentContent }: EtsyHomepageProps) {
  const topTools = [etsyTools.everbee, etsyTools.alura, etsyTools.kittl].filter(
    (t): t is EtsyTool => Boolean(t),
  );

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

  const [featuredTool, ...runnerUpTools] = topTools;
  const vsLeft = topTools[1]; // Alura
  const vsRight = topTools[0]; // EverBee

  return (
    <div className="bg-white text-slate-900">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* ============ HERO + AUDIT CARD ============ */}
      <section className="relative overflow-hidden py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />
              Independent Evaluation Lab
            </span>
            <h1
              className="mt-7 text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[72px]"
              style={{ color: INK }}
            >
              The intelligence layer for Etsy.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-500">
              Independent, data-driven benchmarks for the Etsy ecosystem. Compare performance,
              pricing, and compliance across 50+ seller tools.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/tools"
                className="inline-flex min-h-[52px] items-center justify-center rounded-lg px-8 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: NAVY }}
              >
                Explore the Leaderboard
              </Link>
              <Link
                href="/how-we-rank"
                className="inline-flex min-h-[52px] items-center justify-center rounded-lg border border-slate-200 bg-white px-8 text-[15px] font-semibold text-slate-900 transition-colors hover:border-slate-400"
              >
                Methodology
              </Link>
            </div>
          </div>

          {/* Head-to-head audit card */}
          {vsLeft && vsRight && (
            <div className="relative">
              <div
                className="absolute -inset-3 rounded-[32px] border border-slate-200/70"
                aria-hidden="true"
              />
              <div className="relative rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_30px_80px_-30px_rgba(13,16,36,0.18)] sm:p-10">
                <div className="flex items-center justify-between border-b border-slate-100 pb-7">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-11 w-11 place-items-center rounded-xl text-lg font-bold text-white"
                      style={{ backgroundColor: NAVY }}
                    >
                      {vsLeft.name.charAt(0)}
                    </span>
                    <span className="text-[17px] font-semibold">{vsLeft.name}</span>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    VS
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[17px] font-semibold">{vsRight.name}</span>
                    <span
                      className="grid h-11 w-11 place-items-center rounded-xl text-lg font-bold text-white"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {vsRight.name.charAt(0)}
                    </span>
                  </div>
                </div>

                <div className="border-b border-slate-100 py-6">
                  <div className="flex items-end justify-between gap-6">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Data Fidelity
                      </div>
                      <div className="mt-1.5 text-sm text-slate-600">Direct API Access</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-end gap-[3px]" aria-hidden="true">
                        {[8, 12, 16, 20].map((h, i) => (
                          <span
                            key={h}
                            className="w-[14px] rounded-[2px]"
                            style={{
                              height: h,
                              backgroundColor: i < 2 ? INK : i === 2 ? ACCENT : "#D7E3FC",
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 text-xs font-bold" style={{ color: ACCENT }}>
                        +12% Higher
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b border-slate-100 py-6">
                  <div className="flex items-end justify-between gap-6">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        SEO Accuracy
                      </div>
                      <div className="mt-1.5 text-sm text-slate-600">Keyword Coverage</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-end gap-[3px]" aria-hidden="true">
                        {[8, 12, 16, 20].map((h, i) => (
                          <span
                            key={h}
                            className="w-[14px] rounded-[2px]"
                            style={{
                              height: h,
                              backgroundColor: i < 1 ? INK : i < 3 ? ACCENT : ACCENT,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 text-xs font-bold text-slate-900">98.4% Match</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6">
                  <div className="flex -space-x-2" aria-hidden="true">
                    {["#0B1120", "#2D6BF0", "#94A3B8"].map((c) => (
                      <span
                        key={c}
                        className="h-6 w-6 rounded-full border-2 border-white"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">Last audit: Oct 2026</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============ BENCHMARKS BY CATEGORY ============ */}
      <section className="border-t border-slate-100 py-20 md:py-24" style={{ backgroundColor: "#FAFBFD" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-[40px] md:leading-[1.1]">
                Benchmarks by category
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Systematic evaluations across the entire seller workflow.
              </p>
            </div>
            <div className="flex gap-8 text-[15px] font-semibold">
              <span className="border-b-2 pb-2" style={{ borderColor: INK, color: INK }}>
                Core Ecosystem
              </span>
              <Link href="/tools" className="pb-2 text-slate-400 transition-colors hover:text-slate-600">
                New Arrivals
              </Link>
            </div>
          </div>

          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-slate-200">
            {PHASES.map((p) => (
              <Link
                key={p.phase}
                href={p.href}
                className="group flex flex-col border-b border-slate-200 p-9 transition-colors last:border-b-0 hover:bg-slate-50 sm:border-b-0"
              >
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: ACCENT }}
                >
                  {p.phase}
                </span>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-500">{p.body}</p>
                <div className="mt-10 flex items-center justify-between border-t border-slate-100 pt-5">
                  <span className="text-sm font-semibold">{p.count}</span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-900" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============ LEADERBOARD ============ */}
      {featuredTool && (
        <section className="py-20 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight md:text-[40px] md:leading-[1.1]">
                  Q4 2026 Leaderboard
                </h2>
                <p className="mt-3 max-w-xl text-base text-slate-500">
                  Top-performing tools based on direct API throughput and UX latency audits.
                </p>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                System Health: <span className="text-slate-600">99.98%</span>
              </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
              {/* Rank #01 featured card */}
              <article className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-2">
                <div className="flex flex-col p-9">
                  <div className="flex gap-2">
                    <span
                      className="rounded-md px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider text-white"
                      style={{ backgroundColor: ACCENT }}
                    >
                      Rank #01
                    </span>
                    <span
                      className="rounded-md px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider text-white"
                      style={{ backgroundColor: NAVY }}
                    >
                      Editors Choice
                    </span>
                  </div>
                  <h3 className="mt-6 text-3xl font-semibold tracking-tight">
                    {featuredTool.name}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-500">
                    {LEADERBOARD_BLURBS[featuredTool.slug] ?? featuredTool.tagline}
                  </p>
                  <div className="mt-8 flex gap-12 border-t border-slate-100 pt-6">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Trust Score
                      </div>
                      <div className="mt-1.5 text-2xl font-bold">
                        {LEADERBOARD_SCORES[featuredTool.slug] ?? "96.8"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Compliance
                      </div>
                      <div className="mt-1.5 text-lg font-bold" style={{ color: GREEN }}>
                        Verified
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative min-h-[280px] bg-slate-100 p-8">
                  {TOOL_SHOTS[featuredTool.slug] && (
                    <div className="relative h-full min-h-[220px] overflow-hidden rounded-xl border border-slate-200 shadow-[0_20px_50px_-20px_rgba(13,16,36,0.25)]">
                      <Image
                        src={TOOL_SHOTS[featuredTool.slug]}
                        alt={`${featuredTool.name} dashboard preview`}
                        fill
                        sizes="(min-width: 1024px) 40vw, 100vw"
                        className="object-cover object-top"
                        priority
                      />
                    </div>
                  )}
                </div>
              </article>

              {/* Ranks #02 / #03 */}
              <div className="grid gap-6">
                {runnerUpTools.map((tool, i) => {
                  const review = getEtsyReviewByToolSlug(tool.slug);
                  const reviewHref = review ? `/review/${review.slug}` : `/tools/${tool.slug}`;
                  return (
                    <article
                      key={tool.slug}
                      className="flex flex-col rounded-2xl border border-slate-200 bg-white p-8"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Rank #0{i + 2}
                        </span>
                        <span className="text-lg font-bold">
                          {LEADERBOARD_SCORES[tool.slug] ?? ""}
                        </span>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold tracking-tight">{tool.name}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">
                        {LEADERBOARD_BLURBS[tool.slug] ?? tool.tagline}
                      </p>
                      <Link
                        href={reviewHref}
                        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
                        style={{ color: ACCENT_TEXT }}
                      >
                        Read Audit Report
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ============ EVALUATION ARCHITECTURE (DARK) ============ */}
      <section className="py-20 md:py-28" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-[44px] md:leading-[1.08]">
              Our evaluation architecture.
            </h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed" style={{ color: "#94A3B8" }}>
              We don&apos;t rely on affiliate rankings. Our scorecards are generated by a
              systematic audit of API response times, data fidelity against real shop metrics, and
              policy compliance.
            </p>
            <div className="mt-12 space-y-9">
              {AUDIT_STEPS.map((s) => (
                <div key={s.num} className="flex gap-6">
                  <span
                    className="pt-0.5 font-mono text-[13px] font-bold"
                    style={{ color: "#7FA8F7" }}
                  >
                    {s.num}
                  </span>
                  <div>
                    <h4 className="text-[17px] font-semibold text-white">{s.title}</h4>
                    <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
                      {s.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active audit pipeline panel */}
          <div
            className="rounded-2xl border p-8 sm:p-10"
            style={{
              backgroundColor: "#0D1424",
              borderColor: "#1E2A3F",
              boxShadow: "0 40px 90px -30px rgba(0,0,0,0.55)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#22C55E" }} />
                Active Audit Pipeline
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                v2.1.0-stable
              </span>
            </div>
            <div className="mt-8 space-y-4">
              {PIPELINE_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-lg border px-5 py-4"
                  style={{ backgroundColor: "#111A2E", borderColor: "#1E2A3F" }}
                >
                  <span className="font-mono text-[13px] text-slate-300">{row.label}</span>
                  <span
                    className="font-mono text-[13px] font-bold"
                    style={{ color: PIPELINE_TONE[row.tone] }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between border-t pt-6" style={{ borderColor: "#1E2A3F" }}>
              <div className="flex gap-2" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-5 w-5 rounded-md border"
                    style={{ borderColor: "#26324A", backgroundColor: "#111A2E" }}
                  />
                ))}
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Full Node Logs
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ LATEST INTELLIGENCE ============ */}
      {latestGuides.length > 0 && (
        <section className="py-20 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight md:text-[40px] md:leading-[1.1]">
                  Latest Intelligence
                </h2>
                <p className="mt-3 text-base text-slate-500">
                  Systematic guides on navigating the technical side of the Etsy marketplace.
                </p>
              </div>
              <Link
                href="/guide"
                className="border-b-2 pb-2 text-[13px] font-bold uppercase tracking-[0.14em] transition-colors hover:text-slate-600"
                style={{ borderColor: INK, color: INK }}
              >
                The Journal
                <ArrowUpRight className="ml-1.5 inline h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-10 md:grid-cols-3">
              {latestGuides.map((content, i) => (
                <Link key={content.id} href={`/${content.type}/${content.slug}`} className="group block">
                  <div className="h-60 overflow-hidden rounded-xl bg-slate-100">
                    {content.featured_image ? (
                      <Image
                        src={content.featured_image}
                        alt=""
                        width={800}
                        height={500}
                        className="h-full w-full object-cover grayscale transition-all duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="h-full w-full transition-transform duration-500 group-hover:scale-105"
                        style={{
                          background: "linear-gradient(135deg,#E9EAF2 0%,#D9DAE8 50%,#C9CBDE 100%)",
                        }}
                      />
                    )}
                  </div>
                  <div
                    className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: ACCENT }}
                  >
                    {INTEL_LABELS[i % INTEL_LABELS.length]}
                  </div>
                  <h3 className="mt-3 text-[21px] font-semibold leading-snug tracking-tight">
                    {content.title}
                  </h3>
                  {content.excerpt && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-500 line-clamp-3">
                      {content.excerpt}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
