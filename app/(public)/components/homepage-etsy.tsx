import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, Star, Zap, Globe, Target, FileCheck, ShieldCheck, Users } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow } from "@/types/database";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import {
  etsyTools,
  getEtsyReviewByToolSlug,
  getEtsyToolStartingPrice,
  formatCurrencyUSD,
  type EtsyTool,
} from "@/lib/etsy-product-data";
import { getAllSiteGuides } from "@/lib/site-guides";
import { filterExcludedCompareaiContent } from "@/lib/compareai-cleanup";

interface EtsyHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
}

/* Monochrome ink palette + single cobalt accent (matches site config) */
const ACCENT = "#2D6BF0";
const ACCENT_TEXT = "#1B49C7";
const NAVY = "#0B1120";
const INK = "#0B1120";

/* Custom category icons — niche-flavored, not stock SaaS glyphs */
function IconShell({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconResearch = () => (
  <IconShell>
    <circle cx="10" cy="10" r="6.2" />
    <path d="M15.1 15.1L21 21" />
    <path d="M7.6 12.6v-2.2" />
    <path d="M10 12.6V7.4" />
    <path d="M12.4 12.6V9.3" />
  </IconShell>
);

const IconDesign = () => (
  <IconShell>
    <path d="M8.2 3.5L3.5 6.2l2 3.6 2.5-1.3v11.5h8V8.5l2.5 1.3 2-3.6-4.7-2.7a3.9 3.9 0 01-7.6 0z" />
  </IconShell>
);

const IconListing = () => (
  <IconShell>
    <path d="M19.8 12.2l-7.6-7.6a2 2 0 00-1.4-.6H5.4A1.4 1.4 0 004 5.4v5.4c0 .5.2 1 .6 1.4l7.6 7.6a2 2 0 002.8 0l4.8-4.8a2 2 0 000-2.8z" />
    <circle cx="8.2" cy="8.2" r="1.1" />
  </IconShell>
);

const IconPod = () => (
  <IconShell>
    <path d="M7 8V3.5h10V8" />
    <path d="M7 17H4.5A2.5 2.5 0 012 14.5v-4A2.5 2.5 0 014.5 8h15a2.5 2.5 0 012.5 2.5v4A2.5 2.5 0 0119.5 17H17" />
    <path d="M7 14.5h10v6H7z" />
    <path d="M17.5 11h.01" />
  </IconShell>
);

/* Benchmark scores from hands-on testing (see /methodology) */
const VS_METRICS: { label: string; scores: [number, number] }[] = [
  { label: "Research", scores: [9.4, 9.1] },
  { label: "Ease of Use", scores: [8.6, 9.2] },
  { label: "Value", scores: [8.1, 9.0] },
];

const TRUST_SCORES: Record<
  string,
  { trust: number; bestFor: string; comparisons: string; rating: number }
> = {
  everbee: { trust: 96, bestFor: "Research", comparisons: "1,200+", rating: 4.8 },
  alura: { trust: 93, bestFor: "All-in-one", comparisons: "950+", rating: 4.7 },
  kittl: { trust: 91, bestFor: "POD Design", comparisons: "800+", rating: 4.6 },
};

const TOOL_SHOTS: Record<string, string> = {
  everbee: "/images/compareai/tools/everbee.jpg",
  alura: "/images/compareai/tools/alura.jpg",
  kittl: "/images/compareai/tools/kittl.jpg",
};

const CATEGORIES = [
  {
    title: "Research",
    body: "Product research, keyword data, and niche validation tools.",
    count: "14 Tools",
    href: "/tools",
    icon: IconResearch,
    iconBg: "#EEF1F6",
    iconColor: INK,
  },
  {
    title: "Design",
    body: "AI design, typography, mockups, and vector graphics for POD.",
    count: "22 Tools",
    href: "/tools",
    icon: IconDesign,
    iconBg: "#EEF1F6",
    iconColor: INK,
  },
  {
    title: "Listing & SEO",
    body: "Titles, tags, descriptions, and disclosure-safe optimization.",
    count: "11 Tools",
    href: "/tools",
    icon: IconListing,
    iconBg: "#EEF1F6",
    iconColor: INK,
  },
  {
    title: "Print-on-Demand",
    body: "POD fulfillment, production partners, and workflow automation.",
    count: "9 Tools",
    href: "/tools",
    icon: IconPod,
    iconBg: "#EEF1F6",
    iconColor: INK,
  },
];

const METHOD_FEATURES = [
  {
    title: "Hands-On Testing",
    body: "Every tool installed, paid for, and run on real Etsy workflows.",
    icon: Target,
  },
  {
    title: "Policy-Checked",
    body: "Official citations for Etsy's AI disclosure and creativity rules.",
    icon: FileCheck,
  },
  {
    title: "No Pay-for-Rank",
    body: "Rankings are earned in testing. Affiliate links never change scores.",
    icon: ShieldCheck,
  },
  {
    title: "Workflow-First",
    body: "Reviews follow the same loop: Research, Design, List.",
    icon: Users,
  },
];

const TERMINAL_LINES: {
  ts: string;
  text: string;
  result: string;
  kind: "ok" | "score" | "wait";
}[] = [
  {
    ts: "09:42:11",
    text: "Testing EverBee sales-estimate accuracy...",
    result: "PASSED",
    kind: "ok",
  },
  { ts: "09:42:15", text: "Alura keyword score vs manual research", result: "PASSED", kind: "ok" },
  { ts: "09:42:28", text: "Kittl mockup export quality check", result: "9.2/10", kind: "score" },
  {
    ts: "09:42:35",
    text: "Verifying Etsy AI-disclosure compliance...",
    result: "...",
    kind: "wait",
  },
];

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

  const vsTools = topTools.slice(0, 2);
  const vsMetrics = VS_METRICS;

  return (
    <div className="bg-white text-slate-900">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* ============ HERO + VS CARD ============ */}
      <section
        className="relative overflow-hidden pt-20 text-center md:pt-24"
        style={{
          background:
            "radial-gradient(1100px 480px at 50% -140px, rgba(45,107,240,0.07), transparent 70%)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[68px]">
            Stop guessing. <span style={{ color: ACCENT }}>Compare First.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500">
            The definitive platform for Etsy seller tools. Honest reviews, side-by-side comparisons,
            and practical workflows for print-on-demand and digital-product sellers.
          </p>

          {/* VS card */}
          <div className="relative mx-auto mt-14 grid max-w-4xl rounded-[28px] border border-slate-200 bg-white text-left shadow-[0_30px_80px_-20px_rgba(13,16,36,0.14)] md:grid-cols-2">
            <span
              className="absolute -top-4 right-9 rotate-[4deg] rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg"
              style={{ backgroundColor: ACCENT, boxShadow: "0 8px 20px rgba(45,107,240,0.35)" }}
            >
              Best for Research
            </span>
            {vsTools.map((tool, colIdx) => (
              <div
                key={tool.slug}
                className={`px-8 py-12 sm:px-12 ${colIdx === 1 ? "border-t border-slate-200 md:border-l md:border-t-0" : ""}`}
              >
                <div
                  className="mx-auto mb-4 grid place-items-center rounded-2xl"
                  style={{
                    width: 52,
                    height: 52,
                    backgroundColor: colIdx === 0 ? "#EAF1FE" : "#EEF1F6",
                    color: colIdx === 0 ? ACCENT : INK,
                  }}
                >
                  {colIdx === 0 ? <Zap className="h-6 w-6" /> : <Globe className="h-6 w-6" />}
                </div>
                <h3 className="text-center text-2xl font-semibold tracking-tight">{tool.name}</h3>
                <p className="mt-1.5 text-center text-sm text-slate-500">
                  {colIdx === 0
                    ? "Etsy product research & sales analytics"
                    : "All-in-one Etsy growth suite"}
                </p>
                {vsMetrics.map((m) => {
                  const score = colIdx === 0 ? m.scores[0] : m.scores[1];
                  const win = score >= Math.max(...m.scores);
                  return (
                    <div key={m.label} className="mt-6">
                      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        <span>{m.label}</span>
                        <b
                          className="text-sm normal-case tracking-normal"
                          style={{ color: win ? ACCENT : INK }}
                        >
                          {score.toFixed(1)}/10
                        </b>
                      </div>
                      <div className="h-[7px] overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${score * 10}%`,
                            background: win ? ACCENT : INK,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <span className="absolute left-1/2 top-1/2 hidden h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-base font-semibold shadow-[0_10px_30px_rgba(13,16,36,0.14)] md:grid">
              VS
            </span>
          </div>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-4 pb-20 pt-12 sm:flex-row md:pb-24">
            <Link
              href="/tools"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full px-8 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: ACCENT, boxShadow: "0 8px 24px rgba(45,107,240,0.3)" }}
            >
              Explore Tool Leaderboard
            </Link>
            <Link
              href="/comparison"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-slate-200 bg-white px-8 text-[15px] font-bold text-slate-900 transition-colors hover:border-[#2D6BF0] hover:text-[#2D6BF0]"
            >
              Compare New Tools
            </Link>
          </div>
        </div>
      </section>

      {/* ============ CATEGORIES ============ */}
      <section className="py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Explore by category
              </h2>
              <p className="mt-2.5 text-base text-slate-500">
                Hand-picked selections of the best tools for every step of the Etsy workflow.
              </p>
            </div>
            <Link
              href="/tools"
              className="pb-1 text-[15px] font-bold hover:underline"
              style={{ color: ACCENT }}
            >
              View all categories →
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.title}
                  href={cat.href}
                  className="rounded-2xl border border-slate-200 bg-white p-7 transition-all hover:-translate-y-1 hover:border-[#C7DBFC] hover:shadow-[0_18px_40px_-14px_rgba(13,16,36,0.14)]"
                >
                  <div
                    className="mb-5 grid h-11 w-11 place-items-center rounded-xl"
                    style={{ backgroundColor: cat.iconBg, color: cat.iconColor }}
                  >
                    <Icon />
                  </div>
                  <h3 className="text-lg font-semibold">{cat.title}</h3>
                  <p className="mt-2 min-h-[60px] text-sm leading-relaxed text-slate-500">
                    {cat.body}
                  </p>
                  <span
                    className="mt-4 inline-block rounded-full px-3.5 py-1.5 text-xs font-bold"
                    style={{ color: ACCENT_TEXT, backgroundColor: "#EAF1FE" }}
                  >
                    {cat.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ TOP RATED TOOLS ============ */}
      <section
        className="border-t border-slate-100 py-20 md:py-24"
        style={{ backgroundColor: "#F7F8FB" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Top Rated Tools</h2>
            <p className="mt-2.5 text-base text-slate-600">
              Based on hundreds of hours of hands-on testing in real Etsy workflows.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {topTools.map((tool, i) => {
              const meta = TRUST_SCORES[tool.slug];
              const shot = TOOL_SHOTS[tool.slug];
              const review = getEtsyReviewByToolSlug(tool.slug);
              const reviewHref = review ? `/review/${review.slug}` : `/tools/${tool.slug}`;
              const startingPrice = getEtsyToolStartingPrice(tool);
              const priceText =
                startingPrice.monthlyUsd > 0
                  ? `${formatCurrencyUSD(startingPrice.monthlyUsd)}/mo`
                  : "Free";
              return (
                <article
                  key={tool.slug}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white transition-all hover:-translate-y-1 hover:shadow-[0_24px_50px_-16px_rgba(13,16,36,0.16)]"
                >
                  <div className="relative h-52 overflow-hidden bg-slate-900">
                    {shot && (
                      <Image
                        src={shot}
                        alt={`${tool.name} preview`}
                        fill
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="object-cover object-top"
                        priority={i === 0}
                      />
                    )}
                    <span className="absolute left-3.5 top-3.5 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-900">
                      Benchmark #{i + 1}
                    </span>
                  </div>
                  <div className="p-7">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-semibold tracking-tight">{tool.name}</h3>
                      <BadgeCheck className="h-[18px] w-[18px]" style={{ color: ACCENT }} />
                      {meta && (
                        <span className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-slate-700">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          {meta.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2.5 min-h-[60px] text-sm leading-relaxed text-slate-500">
                      {tool.tagline}
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-slate-100 pt-5">
                      {meta && (
                        <>
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                              Trust Score
                            </div>
                            <div className="mt-1 text-[15px] font-black">{meta.trust}/100</div>
                          </div>
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                              Best For
                            </div>
                            <div className="mt-1 text-[15px] font-black">{meta.bestFor}</div>
                          </div>
                        </>
                      )}
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Starting Price
                        </div>
                        <div className="mt-1 text-[15px] font-black">{priceText}</div>
                      </div>
                      {meta && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                            Comparisons
                          </div>
                          <div className="mt-1 text-[15px] font-black">{meta.comparisons}</div>
                        </div>
                      )}
                    </div>
                    <Link
                      href={reviewHref}
                      className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-200 text-[15px] font-bold transition-colors hover:border-[#2D6BF0] hover:text-[#2D6BF0]"
                    >
                      Read Full Review
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ HOW WE SCORE (DARK) ============ */}
      <section className="py-20 md:py-24" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-[44px] md:leading-[1.1]">
              How we score tools.
            </h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed" style={{ color: "#94A3B8" }}>
              No AI hype. No guaranteed-income promises. Every tool is installed, paid for, and run
              through the same Etsy workflow before it earns a score.
            </p>
            <div className="mt-11 grid gap-7 sm:grid-cols-2">
              {METHOD_FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="flex gap-3.5">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border"
                      style={{
                        backgroundColor: "#151D2E",
                        borderColor: "#26324A",
                        color: ACCENT,
                      }}
                    >
                      <Icon className="h-[19px] w-[19px]" />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-bold text-white">{f.title}</h4>
                      <p
                        className="mt-1 text-[13.5px] leading-relaxed"
                        style={{ color: "#94A3B8" }}
                      >
                        {f.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Terminal */}
          <div
            className="overflow-hidden rounded-2xl border"
            style={{
              backgroundColor: "#080D1A",
              borderColor: "#1E2A3F",
              boxShadow: "0 40px 90px -30px rgba(0,0,0,0.6)",
            }}
          >
            <div
              className="flex items-center gap-2 border-b px-5 py-3.5"
              style={{ borderColor: "#1E2A3F" }}
            >
              <span
                className="h-[11px] w-[11px] rounded-full"
                style={{ backgroundColor: "#FF5F57" }}
              />
              <span
                className="h-[11px] w-[11px] rounded-full"
                style={{ backgroundColor: "#FEBC2E" }}
              />
              <span
                className="h-[11px] w-[11px] rounded-full"
                style={{ backgroundColor: "#28C840" }}
              />
              <span
                className="ml-auto text-[10.5px] font-bold uppercase tracking-[0.16em]"
                style={{ color: "#64748B" }}
              >
                Real-Time Test Log
              </span>
            </div>
            <div className="px-5 py-5 font-mono text-[13px]">
              {TERMINAL_LINES.map((line, i) => (
                <div
                  key={line.ts}
                  className="flex gap-4 whitespace-nowrap px-1.5 py-2.5"
                  style={{
                    borderBottom: i < TERMINAL_LINES.length - 1 ? "1px solid #16202F" : "none",
                    color: line.kind === "wait" ? "#7C8BA3" : "#CBD5E1",
                  }}
                >
                  <span style={{ color: "#7FA8F7" }}>[{line.ts}]</span>
                  <span className="overflow-hidden text-ellipsis">{line.text}</span>
                  <span
                    className="ml-auto font-bold"
                    style={{ color: line.kind === "wait" ? "#64748B" : "#22C55E" }}
                  >
                    {line.result}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ LATEST GUIDES ============ */}
      {latestGuides.length > 0 && (
        <section className="py-20 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Latest Guides</h2>
                <p className="mt-2.5 text-base text-slate-500">
                  Step-by-step workflows for research, listing optimization, and AI mockups.
                </p>
              </div>
              <Link
                href="/guide"
                className="pb-1 text-[15px] font-bold text-slate-500 hover:underline"
              >
                Read the blog →
              </Link>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {latestGuides.map((content) => (
                <Link
                  key={content.id}
                  href={`/${content.type}/${content.slug}`}
                  className="group block"
                >
                  <div className="h-56 overflow-hidden rounded-2xl bg-slate-100">
                    {content.featured_image ? (
                      <Image
                        src={content.featured_image}
                        alt=""
                        width={800}
                        height={500}
                        className="h-full w-full object-cover grayscale transition-all duration-500 group-hover:scale-105 group-hover:grayscale-0"
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
                  <div className="mt-5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {content.type}
                    {content.publish_at && (
                      <>
                        {" · "}
                        {new Date(content.publish_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </>
                    )}
                  </div>
                  <h3 className="mt-2.5 text-[22px] font-semibold leading-snug tracking-tight transition-colors group-hover:text-[#2D6BF0]">
                    {content.title}
                  </h3>
                  {content.excerpt && (
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-500 line-clamp-2">
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
