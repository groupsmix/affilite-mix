import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site-context";
import { getPageBySlug } from "@/lib/dal/pages";
import { getTenantClient } from "@/lib/supabase-server";
import { shouldSkipDbCall } from "@/lib/db-available";
import { sanitizeHtmlMemoized } from "@/lib/sanitize-html";
import { JsonLd, breadcrumbJsonLd, productJsonLd, itemListJsonLd } from "../../components/json-ld";
import { PriceHistoryChart } from "../../components/price-history-chart";
import { PriceAlertForm } from "../../components/price-alert-form";
import type { ProductRow } from "@/types/database";
import type { SiteDefinition } from "@/config/site-definition";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";

// This route handles two URL shapes under `/p/<slug>`:
//
//   1. Product comparison pages: slug matches `<a>-vs-<b>` where both
//      `<a>` and `<b>` resolve to active products on the current site.
//   2. Custom CMS pages: slug matches a published row in the `pages`
//      table for the current site.
//
// The comparison shape is checked first because its pattern is strict
// (`-vs-` substring + two existing product slugs); if the comparison
// doesn't resolve, we fall through to the custom-page lookup so a
// legitimately-named page like `apples-vs-oranges` is still reachable
// as a CMS page when it isn't a real product comparison.
//
// Historically these two cases lived in sibling dynamic routes
// (`[comparison]` and `[pageSlug]`). Next.js 15 rejects that at
// runtime with "You cannot use different slug names for the same
// dynamic path", making every URL under the public tree 500. Merging
// them into a single `[pageSlug]` route restores route resolution.

interface PageProps {
  params: Promise<{ pageSlug: string }>;
}

function parseComparisonSlug(slug: string): { slugA: string; slugB: string } | null {
  const match = slug.match(/^(.+)-vs-(.+)$/);
  if (!match) return null;
  return { slugA: match[1]!, slugB: match[2]! };
}

async function getProducts(siteId: string, slugA: string, slugB: string) {
  const sb = await getTenantClient();
  const { data } = await sb
    // eslint-disable-next-line no-restricted-syntax -- Audited: server component uses site-scoped getTenantClient() (RLS-enforced)
    .from("products")
    .select(
      "id, site_id, name, slug, description, affiliate_url, image_url, image_alt, price:price_label, price_amount, price_currency, merchant, score, featured, status, category_id, category_ids, cta_text, deal_text, deal_expires_at, pros, cons, version, created_at, updated_at",
    )
    .eq("site_id", siteId)
    .in("slug", [slugA, slugB])
    .eq("status", "active");

  if (!data || data.length < 2) return null;

  const rows = data as unknown as ProductRow[];
  const productA = rows.find((p) => p.slug === slugA);
  const productB = rows.find((p) => p.slug === slugB);

  if (!productA || !productB) return null;
  return { productA, productB };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { pageSlug } = await params;
  const site = await getCurrentSite();

  try {
    // Mirror CustomPage's fallthrough: only emit comparison metadata when
    // the slug parses AND both products actually resolve in the DB. A
    // `*-vs-*` slug whose products don't exist may still be a CMS page,
    // so fall through to the page-table lookup in that case to keep the
    // metadata aligned with what is actually rendered.
    //
    // `getCurrentSite()` returns site.id as the DB UUID (see
    // lib/site-context.ts:153 and :164), so it can be passed straight
    // to getProducts without a separate slug→UUID resolution step.
    const parsed = parseComparisonSlug(pageSlug);
    if (parsed && !shouldSkipDbCall()) {
      const products = await getProducts(site.id, parsed.slugA, parsed.slugB);
      if (products) {
        const nameA = products.productA.name;
        const nameB = products.productB.name;
        const title = `${nameA} vs ${nameB}`;
        const description = `Compare ${nameA} and ${nameB} side by side. Specs, prices, pros & cons on ${site.name}.`;
        const url = `https://${site.domain}/p/${pageSlug}`;

        return {
          title: `${title} — ${site.name}`,
          description,
          alternates: { canonical: url },
          openGraph: {
            title: `${title} — ${site.name}`,
            description,
            url,
            siteName: site.name,
            locale: site.locale,
            type: "article",
          },
          twitter: {
            card: "summary_large_image",
            title: `${title} — ${site.name}`,
            description,
          },
        };
      }
    }

    // site.id is already the DB UUID after getCurrentSite() (see
    // lib/site-context.ts:153 and :164); use it directly rather than
    // re-resolving by slug.
    const page = await getPageBySlug(site.id, pageSlug);
    if (!page || !page.is_published) return {};

    const url = `https://${site.domain}/p/${pageSlug}`;
    const description = `${page.title} — ${site.name}`;
    const fullTitle = `${page.title} — ${site.name}`;

    return {
      title: fullTitle,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: fullTitle,
        description,
        url,
        siteName: site.name,
        locale: site.locale,
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: fullTitle,
        description,
      },
    };
  } catch {
    // fail-open: best-effort
    return {};
  }
}

function SpecRow({ label, valueA, valueB }: { label: string; valueA: string; valueB: string }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3 text-sm font-medium text-gray-600">{label}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{valueA || "—"}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{valueB || "—"}</td>
    </tr>
  );
}

interface ComparisonContentProps {
  slug: string;
  slugA: string;
  slugB: string;
}

// FR-i18n: Localised strings for the comparison view. Mirrors the
// `isArabic` ternary pattern used in `app/(public)/about/page.tsx`.
function comparisonStrings(isAr: boolean) {
  return {
    breadcrumbHome: isAr ? "الرئيسية" : "Home",
    breadcrumbCompare: isAr ? "مقارنة" : "Compare",
    vs: isAr ? "مقابل" : "vs",
    subtitle: isAr
      ? "مقارنة جنباً إلى جنب للمواصفات والأسعار وحكمنا."
      : "Side-by-side comparison of specs, pricing, and our verdict.",
    checkPrice: isAr ? "تحقق من السعر" : "Check Price",
    specifications: isAr ? "المواصفات" : "Specifications",
    feature: isAr ? "الميزة" : "Feature",
    brand: isAr ? "العلامة التجارية" : "Brand",
    price: isAr ? "السعر" : "Price",
    score: isAr ? "التقييم" : "Score",
    pros: isAr ? "المزايا" : "Pros",
    cons: isAr ? "العيوب" : "Cons",
    priceHistory: (name: string) => (isAr ? `سجل أسعار ${name}` : `${name} Price History`),
    ourVerdict: isAr ? "حكمنا" : "Our Verdict",
    edgesOut: (winner: string, ws: number, ls: number, loser: string) =>
      isAr ? (
        <>
          <strong>{winner}</strong> يتفوق بتقييم <strong>{ws}/10</strong> مقابل{" "}
          <strong>{ls}/10</strong> لـ {loser}.
        </>
      ) : (
        <>
          <strong>{winner}</strong> edges out with a score of <strong>{ws}/10</strong> vs{" "}
          <strong>{ls}/10</strong> for the {loser}.
        </>
      ),
    betterValue: (loser: string) =>
      isAr
        ? ` ومع ذلك، يقدم ${loser} قيمة أفضل بسعر أقل.`
        : ` However, the ${loser} offers better value at a lower price point.`,
    takesLead: (winner: string, ws: number, ls: number, loser: string) =>
      isAr ? (
        <>
          <strong>{winner}</strong> يتصدر بتقييم <strong>{ws}/10</strong> مقابل{" "}
          <strong>{ls}/10</strong> لـ {loser}.
        </>
      ) : (
        <>
          <strong>{winner}</strong> takes the lead with a score of <strong>{ws}/10</strong> vs{" "}
          <strong>{ls}/10</strong> for the {loser}.
        </>
      ),
    equalScore: (score: number) =>
      isAr ? (
        <>
          كلا المنتجين بنفس التقييم <strong>{score}/10</strong>. الاختيار يعود إلى التفضيل الشخصي
          والسعر.
        </>
      ) : (
        <>
          Both products score equally at <strong>{score}/10</strong>. Your choice comes down to
          personal preference and price.
        </>
      ),
    noScores: isAr
      ? "قارن المواصفات والأسعار أعلاه لاتخاذ قرارك. كلاهما خيار جيد في فئته."
      : "Compare the specs and pricing above to make your decision. Both are solid choices in their category.",
  };
}

async function renderComparison({ slug, slugA, slugB }: ComparisonContentProps) {
  const site = await getCurrentSite();
  const isArabic = site.language === "ar";
  const cs = comparisonStrings(isArabic);

  if (shouldSkipDbCall()) return null;

  // site.id is already the DB UUID after getCurrentSite() (see
  // lib/site-context.ts:153 and :164), so query products directly.
  const result = await getProducts(site.id, slugA, slugB);
  if (!result) return null;

  const { productA, productB } = result;

  const breadcrumbs = [
    { name: cs.breadcrumbHome, path: "/" },
    { name: cs.breadcrumbCompare, path: "/p" },
    { name: `${productA.name} ${cs.vs} ${productB.name}`, path: `/p/${slug}` },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8" dir={isArabic ? "rtl" : "ltr"}>
      {/* JSON-LD */}
      <JsonLd data={breadcrumbJsonLd(site, breadcrumbs)} />
      <JsonLd data={productJsonLd(site as unknown as SiteDefinition, productA)} />
      <JsonLd data={productJsonLd(site as unknown as SiteDefinition, productB)} />
      {(() => {
        const itemList = itemListJsonLd(site, `${productA.name} vs ${productB.name}`, [
          productA,
          productB,
        ]);
        return itemList ? <JsonLd data={itemList} /> : null;
      })()}

      {/* Header */}
      <h1 className="text-center text-3xl font-bold text-gray-900">
        {productA.name} <span className="text-gray-400">{cs.vs}</span> {productB.name}
      </h1>
      <p className="mt-2 text-center text-gray-600">{cs.subtitle}</p>

      {/* Product images + CTA */}
      <div className="mt-8 grid grid-cols-2 gap-8">
        {[productA, productB].map((product, idx) => (
          <div key={product.id} className="text-center">
            {product.image_url && (
              // G-48: first image is the LCP candidate, the rest defer.
              <Image
                src={product.image_url}
                alt={product.image_alt || product.name}
                width={192}
                height={192}
                sizes="192px"
                priority={idx === 0}
                loading={idx === 0 ? "eager" : "lazy"}
                className="mx-auto h-48 w-48 rounded-lg object-cover"
              />
            )}
            <h2 className="mt-3 text-lg font-semibold text-gray-900">{product.name}</h2>
            {product.merchant && <p className="text-sm text-gray-500">{product.merchant}</p>}
            {product.price && (
              <p className="mt-1 text-xl font-bold text-gray-900">{product.price}</p>
            )}
            {product.score !== null && (
              <div className="mt-1 inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                {product.score}/10
              </div>
            )}
            {hasUsableAffiliateUrl(product.affiliate_url) && (
              <a
                href={`/r/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {product.cta_text || cs.checkPrice}
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Spec comparison table */}
      <div className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-gray-900">{cs.specifications}</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                {cs.feature}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                {productA.name}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                {productB.name}
              </th>
            </tr>
          </thead>
          <tbody>
            <SpecRow label={cs.brand} valueA={productA.merchant} valueB={productB.merchant} />
            <SpecRow label={cs.price} valueA={productA.price} valueB={productB.price} />
            <SpecRow
              label={cs.score}
              valueA={productA.score !== null ? `${productA.score}/10` : "—"}
              valueB={productB.score !== null ? `${productB.score}/10` : "—"}
            />
            <SpecRow label={cs.pros} valueA={productA.pros} valueB={productB.pros} />
            <SpecRow label={cs.cons} valueA={productA.cons} valueB={productB.cons} />
          </tbody>
        </table>
      </div>

      {/* Price history for both */}
      <div className="mt-10 grid grid-cols-2 gap-8">
        <div>
          <h3 className="mb-2 font-semibold text-gray-900">{cs.priceHistory(productA.name)}</h3>
          <PriceHistoryChart productId={productA.id} />
          <div className="mt-3">
            <PriceAlertForm
              productId={productA.id}
              productName={productA.name}
              currentPrice={productA.price_amount ?? undefined}
              currency={productA.price_currency}
              siteLanguage={site.language}
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-gray-900">{cs.priceHistory(productB.name)}</h3>
          <PriceHistoryChart productId={productB.id} />
          <div className="mt-3">
            <PriceAlertForm
              productId={productB.id}
              productName={productB.name}
              currentPrice={productB.price_amount ?? undefined}
              currency={productB.price_currency}
              siteLanguage={site.language}
            />
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div className="mt-10 rounded-lg border bg-gray-50 p-6">
        <h2 className="text-xl font-bold text-gray-900">{cs.ourVerdict}</h2>
        <p className="mt-2 text-gray-700">
          {productA.score !== null && productB.score !== null ? (
            productA.score > productB.score ? (
              <>
                {cs.edgesOut(productA.name, productA.score, productB.score, productB.name)}
                {productA.price_amount &&
                productB.price_amount &&
                productA.price_amount > productB.price_amount
                  ? cs.betterValue(productB.name)
                  : ""}
              </>
            ) : productB.score > productA.score ? (
              cs.takesLead(productB.name, productB.score, productA.score, productA.name)
            ) : (
              cs.equalScore(productA.score)
            )
          ) : (
            cs.noScores
          )}
        </p>
      </div>
    </div>
  );
}

export default async function CustomPage({ params }: PageProps) {
  const { pageSlug } = await params;

  const parsed = parseComparisonSlug(pageSlug);
  if (parsed) {
    const comparison = await renderComparison({
      slug: pageSlug,
      slugA: parsed.slugA,
      slugB: parsed.slugB,
    });
    if (comparison) return comparison;
    // Fall through: a `*-vs-*` slug without matching products may still
    // correspond to a CMS page.
  }

  const site = await getCurrentSite();

  // site.id is already the DB UUID after getCurrentSite() (see
  // lib/site-context.ts:153 and :164); use it directly rather than
  // re-resolving by slug.
  const page = await getPageBySlug(site.id, pageSlug);
  if (!page || !page.is_published) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1
        className="mb-6 text-3xl font-bold tracking-tight"
        style={{ color: "var(--color-primary)" }}
      >
        {page.title}
      </h1>
      <div
        className="prose prose-gray max-w-none"
        // audit5-#32: see lib/sanitize-html.ts — memoized LRU avoids
        // re-running the htmlparser2 pass on every ISR render of the
        // same Page row.
        dangerouslySetInnerHTML={{ __html: sanitizeHtmlMemoized(page.body) }}
      />
    </article>
  );
}
