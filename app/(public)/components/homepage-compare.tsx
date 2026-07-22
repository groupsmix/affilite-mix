import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";
import { ContentCard } from "./content-card";
import { ProductCard } from "./product-card";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";

type CategoryWithCount = CategoryRow & { product_count: number };

interface CompareHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
  productCount: number;
  reviewCount: number;
}

/**
 * "Compare" homepage — an answer-first decision engine for an independent
 * AI-tool review authority (compareai.site).
 *
 * Design intent (see config/sites/ai-compared.ts for the trust palette):
 * the visitor arrives with a question ("which AI for my job, and can I trust
 * the ranking?"). The first view answers it — headline + trust proof + a
 * use-case selector + the current top-rated tools — instead of opening on a
 * decorative hero. Verified-green marks the single top pick; Trust Cobalt
 * (var(--color-accent)) carries every action. No purple, no AI-hype motifs.
 */
export function CompareHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
  productCount,
  reviewCount,
}: CompareHomepageProps) {
  const isAr = site.language === "ar";
  const locale = isAr ? "ar-SA" : "en-US";
  const arrow = isAr ? "←" : "→";
  const firstContentType = site.contentTypes[0]?.value ?? "article";
  const productLabel = isAr ? "منتج" : site.productLabel.toLowerCase();
  const productLabelPlural = isAr ? "منتجات" : site.productLabelPlural.toLowerCase();

  const t = {
    eyebrow: isAr
      ? "مراجعات مستقلة لأدوات الذكاء الاصطناعي"
      : `Independent ${productLabelPlural} reviews`,
    headline: isAr ? "اعثر على الأداة المناسبة لمهمتك." : `Find the right ${productLabel} for you.`,
    sub: isAr
      ? "نختبر الأدوات يدويًا ونرتّبها حسب ما يهمّك فعلًا: الجودة والسرعة والسعر والخصوصية. مستقلّون، نعتمد الأدلّة، ولا ترتيب مدفوع."
      : `We test the ${productLabelPlural} hands-on and rank them by what matters for your use case — quality, price, durability, and value. Independent, evidence-based, no pay-for-rank.`,
    browse: isAr ? "تصفّح المراجعات" : "Browse reviews",
    compare: isAr ? "قارن بين الأدوات" : `Compare ${productLabelPlural}`,
    searchPlaceholder: isAr
      ? "ابحث عن أداة أو قارن بين اثنتين…"
      : `Search a ${productLabel}, or compare two…`,
    chipTested: isAr ? "أداة مختبَرة" : `${productLabelPlural} tested`,
    chipReviews: isAr ? "مراجعة معمّقة" : "in-depth reviews",
    chipUpdated: isAr ? "تحديث أسبوعي" : "Updated weekly",
    chipNoPay: isAr ? "لا ترتيب مدفوع" : "No pay-for-rank",
    useHeading: isAr
      ? "ما الذي تحتاج الذكاء الاصطناعي من أجله؟"
      : `What do you need a ${productLabel} for?`,
    useSub: isAr
      ? "اختر فئة لعرض الأدوات الأعلى تقييمًا حاليًا."
      : `Pick a category to see the current top-rated ${productLabelPlural}.`,
    picksHeading: isAr ? "الأعلى تقييمًا الآن" : "Top-rated right now",
    picksSub: isAr
      ? "أعلى أدواتنا تقييمًا، مختبَرة داخليًا."
      : `Our highest-scoring ${productLabelPlural}, tested in-house.`,
    topPick: isAr ? "الاختيار الأول" : "Top pick",
    tryLabel: isAr ? "جرّبها" : "Try it",
    live: isAr ? "مباشر" : "Live",
    statTested: isAr ? "أداة مختبَرة" : site.productLabelPlural,
    statReviews: isAr ? "مراجعة" : "Reviews",
    statCategories: isAr ? "فئة" : "Categories",
    statCadence: isAr ? "تحديث الأسعار" : "Price refresh",
    weekly: isAr ? "أسبوعيًا" : "Weekly",
    methodHeading: isAr ? "كيف نُرتّب" : "How we rank",
    methodSub: isAr
      ? "نفس المعايير لكل أداة، معلَنة بالكامل."
      : `The same rubric for every ${productLabel}, fully in the open.`,
    recentHeading: isAr ? "أحدث المراجعات والأدلّة" : "Latest reviews & guides",
    viewAll: isAr ? `عرض الكل ${arrow}` : `View all ${arrow}`,
    discHeading: isAr ? "كيف نكسب المال" : "How we make money",
    discBody: isAr
      ? "نكسب عمولة إحالة عند التسجيل عبر بعض الروابط. هذا لا يغيّر أي تقييم أو ترتيب — منهجيتنا ثابتة ومعلَنة."
      : `We earn an affiliate commission when you purchase through some links. That never changes a score or a ranking — our methodology is fixed and public.`,
    discLink: isAr ? `اقرأ إفصاحنا الكامل ${arrow}` : `Read our full disclosure ${arrow}`,
    empty: isAr ? "لا يوجد محتوى بعد" : "No content yet",
  };

  const visibleFeaturedProducts = featuredProducts.filter((p) =>
    hasUsableAffiliateUrl(p.affiliate_url),
  );

  const method = isAr
    ? [
        { title: "اختبار عملي", body: "نستخدم كل أداة في مهام حقيقية قبل تقييمها." },
        { title: "تقييم شفّاف", body: "كل درجة تتفصّل إلى الجودة والسرعة والسعر والدعم." },
        { title: "استقلالية", body: "العمولات لا تغيّر الترتيب أبدًا. المنهجية ثابتة ومعلَنة." },
        { title: "محدّث دائمًا", body: "نعيد الاختبار مع كل تحديث ونحدّث الأسعار أسبوعيًا." },
      ]
    : [
        {
          title: "Hands-on testing",
          body: `We handle every ${productLabel} on real tasks before scoring it.`,
        },
        {
          title: "Transparent scoring",
          body: `Every score breaks down into quality, price, durability, and real-world usability.`,
        },
        {
          title: "Independent",
          body: "Commissions never move a ranking. The methodology is fixed and public.",
        },
        {
          title: "Always current",
          body: `We re-test as ${productLabelPlural} ship updates and refresh prices weekly.`,
        },
      ];

  return (
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* ── Hero: answer-first. Headline + trust proof + entry points ── */}
      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: "var(--color-primary, #0B1120)" }}
      >
        {/* Faint blueprint dot-grid — texture, not decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28 lg:px-8">
          <p
            className="mb-5 font-mono text-xs uppercase tracking-[0.2em]"
            style={{ color: "var(--color-accent-light, #3B82F6)" }}
          >
            {t.eyebrow}
          </p>
          <h1
            className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white md:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {t.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">{t.sub}</p>

          {/* Primary actions */}
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/${firstContentType === "review" ? "review" : "review"}`}
              className="inline-flex min-h-[48px] items-center justify-center rounded-lg px-6 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40"
              style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
            >
              {t.browse}
            </Link>
            <Link
              href="/comparison"
              className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-white/15 px-6 text-base font-semibold text-white transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              {t.compare}
            </Link>
          </div>

          {/* Search affordance — looks like an input, navigates to /search */}
          <Link
            href="/search"
            className="mt-6 flex max-w-xl items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-400 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <span>{t.searchPlaceholder}</span>
          </Link>

          {/* Trust strip — mono, evidence-first */}
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs text-gray-400">
            {productCount > 0 && (
              <span>
                <span className="tabular-nums text-white">{productCount}+</span> {t.chipTested}
              </span>
            )}
            {reviewCount > 0 && (
              <span>
                <span className="tabular-nums text-white">{reviewCount}</span> {t.chipReviews}
              </span>
            )}
            <span className="text-white/80">{t.chipUpdated}</span>
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
              {t.chipNoPay}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── Use-case selector: the decision step ── */}
        {categories.length > 0 && (
          <section className="py-14">
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              {t.useHeading}
            </h2>
            <p className="mt-2 text-base text-gray-600">{t.useSub}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat, i) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  aria-label={isAr ? `تصفّح فئة ${cat.name}` : `Browse ${cat.name}`}
                  className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={
                    i === 0
                      ? {
                          borderColor: "var(--color-accent, #2D6BF0)",
                          boxShadow: "inset 0 0 0 1px var(--color-accent, #2D6BF0)",
                        }
                      : undefined
                  }
                >
                  <span>
                    <span className="block font-semibold text-gray-900">{cat.name}</span>
                    {cat.product_count > 0 && (
                      <span className="mt-0.5 block font-mono text-xs tabular-nums text-gray-500">
                        {cat.product_count} {isAr ? "أداة" : productLabelPlural}
                      </span>
                    )}
                  </span>
                  <span
                    className="text-lg transition-transform group-hover:translate-x-0.5"
                    style={{ color: "var(--color-accent-text, var(--color-accent))" }}
                    aria-hidden="true"
                  >
                    {arrow}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Top picks: verdict cards. #1 gets the verified-green signal ── */}
        {visibleFeaturedProducts.length > 0 && (
          <section className="border-t border-gray-100 py-14">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2
                  className="text-2xl font-semibold tracking-tight"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
                >
                  {t.picksHeading}
                </h2>
                <p className="mt-2 text-base text-gray-600">{t.picksSub}</p>
              </div>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleFeaturedProducts.map((product, i) => (
                <div key={product.id} className="relative">
                  {/* Rank badge — mono telemetry */}
                  <span className="absolute -top-2 left-3 z-10 rounded-md bg-gray-900 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-white shadow-sm">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {i === 0 && (
                    <span className="absolute -top-2 right-3 z-10 inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                      <svg
                        className="h-3 w-3"
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
                      {t.topPick}
                    </span>
                  )}
                  <div
                    className="h-full rounded-xl"
                    style={
                      i === 0
                        ? { boxShadow: "0 0 0 2px rgba(16,185,129,0.45)", borderRadius: "0.75rem" }
                        : undefined
                    }
                  >
                    <ProductCard
                      product={product}
                      sourceType="homepage"
                      ctaLabel={t.tryLabel}
                      variant="detailed"
                      priority={false}
                    />
                  </div>
                </div>
              ))}
            </div>
            {/* Affiliate transparency — inline, not buried */}
            <p className="mt-6 max-w-3xl text-xs leading-relaxed text-gray-500">
              {site.affiliateDisclosure}
            </p>
          </section>
        )}
      </div>

      {/* ── Telemetry ticker: the "instrument" readout (dark, mono) ── */}
      <section
        className="border-y border-white/10"
        style={{ backgroundColor: "var(--color-primary, #0B1120)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-4 px-4 py-6 font-mono sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {t.live}
          </span>
          <Stat value={`${productCount}`} label={t.statTested} />
          <Stat value={`${reviewCount}`} label={t.statReviews} />
          <Stat value={`${categories.length}`} label={t.statCategories} />
          <Stat value={t.weekly} label={t.statCadence} />
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── How we rank: trust centerpiece ── */}
        <section className="relative py-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px)",
              backgroundSize: "44px 100%",
            }}
          />
          <div className="relative">
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              {t.methodHeading}
            </h2>
            <p className="mt-2 max-w-2xl text-base text-gray-600">{t.methodSub}</p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
              {method.map((m, i) => (
                <div key={m.title} className="bg-white p-6">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg font-mono text-sm font-semibold tabular-nums"
                    style={{
                      color: "var(--color-accent-text, var(--color-accent))",
                      backgroundColor: "rgba(45,107,240,0.10)",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 font-semibold text-gray-900">{m.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Latest reviews & guides ── */}
        {recentContent.length > 0 && (
          <section className="border-t border-gray-100 py-14">
            <div className="mb-8 flex items-center justify-between">
              <h2
                className="text-2xl font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
              >
                {t.recentHeading}
              </h2>
              <Link
                href={`/${firstContentType}`}
                className="font-mono text-sm font-medium transition-colors"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                {t.viewAll}
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentContent.map((content) => (
                <ContentCard key={content.id} content={content} locale={locale} priority={false} />
              ))}
            </div>
          </section>
        )}

        {/* ── Transparency seal: the trust move ── */}
        <section className="pb-20 pt-6">
          <div
            className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8"
            style={{
              borderInlineStartWidth: "3px",
              borderInlineStartColor: "var(--color-accent, #2D6BF0)",
            }}
          >
            <p
              className="font-mono text-xs uppercase tracking-[0.2em]"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              {isAr ? "إفصاح" : "Disclosure"}
            </p>
            <h2
              className="mt-2 text-xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-heading)", color: "var(--color-primary)" }}
            >
              {t.discHeading}
            </h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-gray-600">{t.discBody}</p>
            <Link
              href="/affiliate-disclosure"
              className="mt-4 inline-flex font-mono text-sm font-semibold transition-colors"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              {t.discLink}
            </Link>
          </div>
        </section>

        {/* Empty state */}
        {recentContent.length === 0 && visibleFeaturedProducts.length === 0 && (
          <div className="py-20 text-center text-gray-500">
            <p className="text-lg">{t.empty}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Single mono telemetry readout used in the ticker. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums text-white">{value}</span>
      <span className="text-xs uppercase tracking-wider text-gray-400">{label}</span>
    </span>
  );
}
