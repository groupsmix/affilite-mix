import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";

type CategoryWithCount = CategoryRow & { product_count: number };
import { ContentCard } from "./content-card";
import { ProductCard } from "./product-card";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import {
  Reveal,
  CountUp,
  ScoreDial,
  MiniGauge,
  LiveWatchDial,
  ScrollProgress,
} from "./cinematic-ui";

interface CinematicHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
  productCount?: number;
  reviewCount?: number;
}

/** Faint engine-turned (guilloché) texture for dark hero sections. */
function GuillocheTexture({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="guilloche" width="46" height="46" patternUnits="userSpaceOnUse">
          <circle cx="23" cy="23" r="22" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="23" cy="23" r="14" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="22" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="46" cy="46" r="22" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#guilloche)" />
    </svg>
  );
}

const SCORE_CRITERIA = [
  { label: "Craftsmanship", value: 9.2, note: "Movement, finishing & materials" },
  { label: "Value", value: 8.7, note: "What you get for the price" },
  { label: "Wow Factor", value: 9.5, note: "The moment it's unboxed" },
  { label: "Wearability", value: 9.0, note: "Comfort & everyday versatility" },
];

export function CinematicHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
  productCount = 0,
  reviewCount = 0,
}: CinematicHomepageProps) {
  const isArabic = site.language === "ar";
  const locale = isArabic ? "ar-SA" : "en-US";
  const ctaLabel = isArabic ? "احصل على العرض" : "View Deal";
  const firstContentType = site.contentTypes[0]?.value ?? "article";
  const productLabelLower = site.productLabel.toLowerCase();

  const heroScore = featuredProducts.reduce((max, p) => Math.max(max, p.score ?? 0), 0) || 9.4;

  const headline = isArabic
    ? `اعثر على ${site.productLabel} الذي يستحق الإهداء.`
    : `Find the ${productLabelLower} worth gifting.`;

  return (
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />
      <ScrollProgress />

      {/* ── Hero — cinematic ──────────────────────────────────────── */}
      <section
        className="relative flex min-h-[92vh] items-center overflow-hidden text-white"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(120% 90% at 78% 18%, color-mix(in srgb, var(--color-primary) 70%, white) 0%, var(--color-primary) 42%, color-mix(in srgb, var(--color-primary) 78%, black) 100%)`,
            }}
          />
          <div
            className="absolute right-[14%] top-[16%] h-[460px] w-[460px] rounded-full blur-[130px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-accent-light) 14%, transparent)",
            }}
          />
          <div
            className="absolute bottom-[12%] left-[10%] h-[320px] w-[320px] rounded-full blur-[100px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-accent-light) 8%, transparent)",
            }}
          />
          <GuillocheTexture className="absolute inset-0 text-white/[0.04]" />
          {/* film grain / vignette */}
          <div
            className="absolute inset-0"
            style={{ boxShadow: "inset 0 0 220px 40px rgba(0,0,0,0.55)" }}
          />
        </div>

        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 py-24 sm:px-6 md:py-28 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:px-8 lg:py-32">
          <div className="max-w-2xl">
            <Reveal>
              <div className="mb-7 flex items-center gap-3">
                <div
                  className="h-px w-12"
                  style={{
                    background: `linear-gradient(to right, var(--color-accent-light), transparent)`,
                  }}
                />
                <span
                  className="text-xs font-bold uppercase tracking-[0.22em]"
                  style={{ color: "var(--color-accent-light)" }}
                >
                  {site.brand.niche}
                </span>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1
                className="text-4xl font-bold leading-[1.04] text-white sm:text-5xl md:text-6xl lg:text-7xl"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {headline}
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-7 max-w-xl text-lg font-light leading-relaxed text-white/70 md:text-xl">
                {site.brand.description}
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link
                  href={`/${firstContentType}`}
                  className="group inline-flex min-h-[56px] items-center justify-center gap-2.5 rounded-full px-8 py-4 text-base font-semibold tracking-wide transition-all duration-500 hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
                  style={{
                    backgroundColor: "var(--color-accent-light)",
                    color: "var(--color-primary)",
                  }}
                >
                  {isArabic ? "استكشف المراجعات" : "Explore Reviews"}
                  <svg
                    className="h-5 w-5 transition-transform duration-500 group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </Link>
                {site.features.giftFinder && (
                  <Link
                    href="/gift-finder"
                    className="inline-flex min-h-[56px] items-center justify-center rounded-full border border-white/25 bg-white/[0.03] px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all duration-500 hover:border-white/40 hover:bg-white/[0.08]"
                  >
                    {isArabic ? "اختبار الهدايا" : "Take the Gift Finder Quiz"}
                  </Link>
                )}
              </div>
            </Reveal>
          </div>

          {/* Hero instrument: Gift-Worthiness gauge + live watch dial */}
          <Reveal delay={200} className="flex justify-center lg:justify-end">
            <div className="relative flex flex-col items-center">
              <div
                className="relative flex flex-col items-center rounded-[2rem] border border-white/10 p-8 backdrop-blur-sm"
                style={{
                  background:
                    "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
                }}
              >
                <span className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
                  {isArabic ? "أعلى تقييم هذا الأسبوع" : "Top Score This Week"}
                </span>
                <ScoreDial score={heroScore} />
                <span
                  className="mt-4 text-sm font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--color-accent-light)" }}
                >
                  {isArabic ? "درجة الجدارة بالإهداء" : "Gift-Worthiness Score"}
                </span>
              </div>
              <div className="absolute -bottom-8 -left-8 hidden sm:block">
                <LiveWatchDial />
              </div>
            </div>
          </Reveal>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--color-bg,#faf8f3)] to-transparent" />
      </section>

      {/* ── Trust strip ───────────────────────────────────────────── */}
      <section className="border-b border-black/5 bg-[#faf8f3]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8">
          {[
            {
              value: <CountUp to={productCount ?? featuredProducts.length ?? 120} suffix="+" />,
              label: isArabic
                ? `${site.productLabelPlural} مُقيّمة`
                : `${site.productLabelPlural} scored`,
            },
            {
              value: <CountUp to={reviewCount ?? recentContent.length ?? 40} suffix="+" />,
              label: isArabic ? "مراجعة خبير" : "Expert reviews",
            },
            { value: <>100%</>, label: isArabic ? "اختبار مستقل" : "Independently tested" },
            { value: <>0</>, label: isArabic ? "مواضع مدفوعة" : "Paid placements" },
          ].map((stat, i) => (
            <Reveal key={i} delay={i * 70} className="flex flex-col items-center text-center">
              <span
                className="text-3xl font-bold md:text-4xl"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {stat.value}
              </span>
              <span className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-500">
                {stat.label}
              </span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Gift-Worthiness Score explainer ───────────────────────── */}
      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <Reveal>
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-[0.22em]"
                  style={{ color: "var(--color-accent-text, var(--color-accent))" }}
                >
                  {isArabic ? "منهجيتنا" : "Our Methodology"}
                </span>
                <h2
                  className="mt-4 text-3xl font-bold leading-tight md:text-4xl lg:text-5xl"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
                >
                  {isArabic ? "درجة الجدارة بالإهداء" : "The Gift-Worthiness Score"}
                </h2>
                <p className="mt-5 max-w-md text-lg leading-relaxed text-gray-600">
                  {isArabic
                    ? "نقيّم كل ساعة عبر أربعة معايير صارمة لنخبرك بشيء واحد: هل تستحق أن تُهدى؟"
                    : `Every ${productLabelLower} is rated across four exacting criteria to answer one question: is it worth giving?`}
                </p>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-500">
                  {isArabic
                    ? "لا مواضع مدفوعة، ولا اختصارات — فقط اختبار صادق."
                    : "No paid placements, no shortcuts — just honest, hands-on testing."}
                </p>
              </div>
            </Reveal>

            <div className="grid grid-cols-2 gap-6">
              {SCORE_CRITERIA.map((c, i) => (
                <Reveal
                  key={c.label}
                  delay={i * 90}
                  className="flex flex-col items-center rounded-2xl border border-black/5 bg-[#faf8f3] p-6 text-center shadow-sm"
                >
                  <MiniGauge value={c.value} />
                  <span
                    className="mt-3 text-sm font-bold uppercase tracking-wider"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {c.label}
                  </span>
                  <span className="mt-1 text-xs leading-snug text-gray-500">{c.note}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured products ─────────────────────────────────────── */}
      {featuredProducts.length > 0 && (
        <section className="bg-[#faf8f3] py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mb-14 text-center">
              <SectionEyebrow color="var(--color-accent-text, var(--color-accent))">
                {isArabic ? "مختارات المحرر" : "Editor's Picks"}
              </SectionEyebrow>
              <h2
                className="mt-4 text-3xl font-bold leading-tight md:text-4xl"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {isArabic
                  ? `أبرز ${site.productLabelPlural}`
                  : `Most Gift-Worthy ${site.productLabelPlural}`}
              </h2>
            </Reveal>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredProducts.map((product, i) => (
                <Reveal key={product.id} delay={(i % 3) * 90}>
                  <ProductCard
                    product={product}
                    sourceType="homepage"
                    ctaLabel={ctaLabel}
                    priority={false}
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Categories ────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <section className="bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mb-14 text-center">
              <SectionEyebrow color="var(--color-accent-text, var(--color-accent))">
                {isArabic ? "التصنيفات" : "Browse"}
              </SectionEyebrow>
              <h2
                className="mt-4 text-3xl font-bold leading-tight md:text-4xl"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {isArabic ? "تصفح حسب التصنيف" : "Shop by Collection"}
              </h2>
            </Reveal>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
              {categories.map((cat, i) => (
                <Reveal key={cat.id} delay={(i % 4) * 70}>
                  <Link
                    href={`/category/${cat.slug}`}
                    aria-label={isArabic ? `تصفح فئة ${cat.name}` : `Browse ${cat.name} category`}
                    className="group flex h-full flex-col rounded-xl border border-black/5 bg-[#faf8f3] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-text)] focus:ring-offset-2 lg:p-7"
                  >
                    <span
                      className="text-sm font-bold transition-colors duration-300 group-hover:text-[var(--color-accent-text)]"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {cat.name}
                    </span>
                    {cat.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-gray-500">{cat.description}</p>
                    )}
                    <span className="mt-auto pt-4 text-xs font-medium text-gray-400">
                      {cat.product_count}{" "}
                      {isArabic
                        ? cat.product_count === 1
                          ? "منتج"
                          : "منتجات"
                        : cat.product_count === 1
                          ? "item"
                          : "items"}
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Gift Finder teaser ────────────────────────────────────── */}
      {site.features.giftFinder && (
        <section
          className="relative overflow-hidden py-20 text-white lg:py-28"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <GuillocheTexture className="absolute inset-0 text-white/[0.04]" />
          <div
            className="absolute right-[18%] top-1/2 h-[300px] w-[300px] -translate-y-1/2 rounded-full blur-[110px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-accent-light) 12%, transparent)",
            }}
          />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Reveal>
              <span
                className="text-xs font-bold uppercase tracking-[0.22em]"
                style={{ color: "var(--color-accent-light)" }}
              >
                {isArabic ? "خدمة الكونسيرج" : "The Concierge"}
              </span>
              <h2
                className="mt-4 text-3xl font-bold leading-tight md:text-4xl lg:text-5xl"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {isArabic ? "لست متأكداً من أين تبدأ؟" : "Not sure where to start?"}
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg font-light text-white/70">
                {isArabic
                  ? "أخبرنا عن المُستلِم والمناسبة والميزانية، وسنرشّح لك الساعة المثالية."
                  : "Tell us the recipient, the occasion, and the budget — we'll match the perfect piece."}
              </p>
              <Link
                href="/gift-finder"
                className="mt-9 inline-flex min-h-[56px] items-center justify-center gap-2.5 rounded-full px-8 py-4 text-base font-semibold transition-all duration-500 hover:shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
                style={{
                  backgroundColor: "var(--color-accent-light)",
                  color: "var(--color-primary)",
                }}
              >
                {isArabic ? "ابدأ اختبار الهدايا" : "Start the Gift Finder"}
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Latest content ────────────────────────────────────────── */}
      {recentContent.length > 0 && (
        <section className="bg-[#faf8f3] py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal className="mb-10 flex items-end justify-between">
              <div>
                <SectionEyebrow color="var(--color-accent-text, var(--color-accent))">
                  {isArabic ? "المجلة" : "The Journal"}
                </SectionEyebrow>
                <h2
                  className="mt-3 text-2xl font-bold md:text-3xl"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
                >
                  {isArabic ? "أحدث المحتوى" : "Latest from WristNerd"}
                </h2>
              </div>
              <Link
                href={`/${firstContentType}`}
                className="shrink-0 text-sm font-semibold transition-colors hover:underline"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                {isArabic ? "عرض الكل ←" : "View all →"}
              </Link>
            </Reveal>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentContent.map((content, i) => (
                <Reveal key={content.id} delay={(i % 3) * 90}>
                  <ContentCard content={content} locale={locale} priority={false} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {recentContent.length === 0 && featuredProducts.length === 0 && categories.length === 0 && (
        <div className="py-24 text-center text-gray-500">
          <p className="text-lg">{isArabic ? "لا يوجد محتوى بعد" : "No content yet"}</p>
        </div>
      )}
    </div>
  );
}

function SectionEyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <div
        className="h-px w-8"
        style={{ background: `linear-gradient(to right, transparent, ${color})` }}
      />
      <span className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color }}>
        {children}
      </span>
      <div
        className="h-px w-8"
        style={{ background: `linear-gradient(to left, transparent, ${color})` }}
      />
    </div>
  );
}
