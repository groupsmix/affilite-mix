import Link from "next/link";
import Image from "next/image";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";
import { ContentCard } from "./content-card";
import { ProductCardCta } from "./product-card-client";
import { ProductLogo } from "./product-logo";
import {
  BookOpen,
  ArrowRightLeft,
  ArrowRight,
  ChevronDown,
  Coins,
  Gift,
  Image as ImageIcon,
  Calculator,
  ShieldCheck,
  UserCheck,
  Check,
} from "lucide-react";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { TaxFinder, type TaxFinderTool, type TopicKey } from "./tax-finder";

type CategoryWithCount = CategoryRow & { product_count: number };

interface TaxFinderHomepageProps {
  site: SiteDefinition;
  recentContent: ContentRow[];
  featuredProducts: ProductRow[];
  categories: CategoryWithCount[];
  productCount: number;
  reviewCount: number;
}

/** Slugs the finder can recommend as software; anything else is surfaced separately. */
const SOFTWARE_SLUGS = new Set([
  "koinly",
  "syla",
  "crypto-tax-calculator",
  "coinledger",
  "cointracking",
  "coinpanda",
]);
const ACCOUNTANT_SLUG = "crypto-accountant-au";

/** One-line positioning per tool, so the comparison is scannable. */
const BEST_FOR: Record<string, string> = {
  koinly: "Best for most people",
  syla: "Best for paying the least tax",
  "crypto-tax-calculator": "Best for complex DeFi",
  coinledger: "Best for simple portfolios",
  cointracking: "Best for power users",
  coinpanda: "Best for many exchanges",
  "crypto-accountant-au": "Best for complex or overdue returns",
};

/** Days until the 31 October self-lodgement deadline (rolls to next year). */
function daysToSelfLodge(): number {
  const now = new Date();
  let dl = Date.UTC(now.getUTCFullYear(), 9, 31);
  if (now.getTime() > dl) dl = Date.UTC(now.getUTCFullYear() + 1, 9, 31);
  return Math.max(0, Math.ceil((dl - now.getTime()) / 86_400_000));
}

function toFinderTool(p: ProductRow): TaxFinderTool {
  return {
    slug: p.slug,
    name: p.name,
    affiliateUrl: p.affiliate_url,
    tagline: p.price,
    imageUrl: p.image_url,
  };
}

export function TaxFinderHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
}: TaxFinderHomepageProps) {
  const firstContentType = site.contentTypes[0]?.value ?? "guide";
  const usable = featuredProducts.filter((p) => hasUsableAffiliateUrl(p.affiliate_url));

  const softwareProducts = usable.filter((p) => SOFTWARE_SLUGS.has(p.slug));
  const finderTools = (softwareProducts.length > 0 ? softwareProducts : usable)
    .filter((p) => p.slug !== ACCOUNTANT_SLUG)
    .map(toFinderTool);
  const accountantRow = usable.find((p) => p.slug === ACCOUNTANT_SLUG);
  const accountant = accountantRow ? toFinderTool(accountantRow) : null;

  const guideHref = (kw: string) => {
    const cat = categories.find((c) => c.slug.includes(kw));
    return cat ? `/category/${cat.slug}` : undefined;
  };
  const guideHrefs: Partial<Record<TopicKey, string>> = {
    trade: guideHref("basic"),
    defi: guideHref("defi"),
    staking: guideHref("staking"),
    airdrop: guideHref("airdrop"),
    nft: guideHref("nft"),
  };

  const ranked = [
    ...usable.filter((p) => p.slug !== ACCOUNTANT_SLUG),
    ...usable.filter((p) => p.slug === ACCOUNTANT_SLUG),
  ];

  const days = daysToSelfLodge();

  const faqs = [
    {
      q: "Do I have to pay tax on crypto in Australia?",
      a: "Usually yes. The ATO treats crypto as property, so selling, swapping or spending it can trigger capital gains tax, and some activity (like staking) is taxed as income. Simply holding crypto isn't taxed.",
    },
    {
      q: "Which crypto tax tool is best for me?",
      a: "Pick what you did at the top of the page to jump to the right one. Broadly: Koinly for most people, Crypto Tax Calculator for heavy DeFi, and Syla to minimise tax.",
    },
    {
      q: "When is the crypto tax deadline?",
      a: "The Australian financial year ends 30 June and self-lodgement is due 31 October. A registered tax agent can give you longer.",
    },
  ];

  return (
    <main>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Hero */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-[13.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--color-accent-text,#15803D)]">
                Australian crypto tax
              </p>
              <h1 className="mt-3 max-w-[18ch] text-4xl font-extrabold leading-[1.05] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                Find the right crypto tax tool for your ATO return.
              </h1>
              <p className="mt-4 max-w-[55ch] text-lg leading-relaxed text-gray-600">
                Pick what you did with crypto. We&apos;ll show your taxable events and the software
                built for it.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href="#finder"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--color-accent,#16A34A)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  Find my tool
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
                <a
                  href="#compare"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                >
                  Compare all tools
                </a>
              </div>
            </div>

            <div className="relative mt-6 aspect-[3/2] w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg lg:mt-0">
              <Image
                src="/images/hero-crypto-tax-au.png"
                alt="Crypto tax report with Australian dollar coins, calculator and rising chart"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <TrustBadge text="Based on ATO rules" />
            <TrustBadge text="Covers DeFi, staking and NFTs" />
            <TrustBadge text="No signup required" />
          </div>
        </div>
      </section>

      {/* Finder */}
      <section id="finder" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <TaxFinder
          tools={finderTools}
          accountant={accountant}
          guideHrefs={guideHrefs}
          daysToDeadline={days}
          affiliateDisclosure={site.affiliateDisclosure}
          sourceType="homepage-finder"
        />
      </section>

      {/* Comparison */}
      {ranked.length > 0 && (
        <section id="compare" className="border-t border-gray-200 bg-gray-50 py-12 lg:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
              Compare every tool
            </h2>
            <p className="mt-2 max-w-[55ch] text-gray-600">
              The full ranking, if you prefer to browse before you pick.
            </p>
            <div className="mt-8 flex flex-col gap-4">
              {ranked.map((p, i) => (
                <ToolRow key={p.id} product={p} index={i} sourceType="homepage-compare" />
              ))}
            </div>
            <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-gray-500">
              {site.affiliateDisclosure}
            </p>
          </div>
        </section>
      )}

      {/* Topic hubs */}
      {categories.length > 0 && (
        <section className="border-t border-gray-200 bg-white py-12 lg:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
              Crypto tax by transaction type
            </h2>
            <p className="mt-2 max-w-[55ch] text-gray-600">
              Go deeper on how the ATO treats each one.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {categories.slice(0, 7).map((cat, i) => {
                const Icon = categoryIcon(cat.slug);
                return (
                  <Link
                    key={cat.id}
                    href={`/category/${cat.slug}`}
                    className={`group rounded-2xl border border-gray-200 bg-gray-50 p-5 transition-all hover:-translate-y-0.5 hover:border-[color:var(--color-accent,#16A34A)]/30 hover:bg-white hover:shadow-md ${
                      i === 0 ? "sm:col-span-2" : ""
                    }`}
                  >
                    <span className="inline-flex size-10 items-center justify-center rounded-lg bg-[color:var(--color-accent,#16A34A)]/10 text-[color:var(--color-accent-text,#15803D)] ring-1 ring-[color:var(--color-accent,#16A34A)]/10 transition-colors group-hover:bg-[color:var(--color-accent,#16A34A)] group-hover:text-white group-hover:ring-[color:var(--color-accent,#16A34A)]">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 font-bold text-gray-900">{cat.name}</h3>
                    {cat.description && (
                      <p className="mt-1 line-clamp-2 text-[13px] text-gray-500">
                        {cat.description}
                      </p>
                    )}
                    <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[color:var(--color-accent-text,#15803D)] group-hover:underline">
                      Learn more <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Popular guides */}
        {recentContent.length > 0 && (
          <section className="py-12 lg:py-16">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
                  Popular guides
                </h2>
                <p className="mt-2 text-gray-600">
                  Plain-English answers for Australian investors.
                </p>
              </div>
              <Link
                href={`/${firstContentType}`}
                className="shrink-0 text-sm font-semibold text-[color:var(--color-accent-text,#15803D)] hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {recentContent.map((content) => (
                <ContentCard key={content.id} content={content} locale="en-AU" priority={false} />
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="pb-16 pt-4">
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Common questions
          </h2>
          <div className="mt-5 border-t border-gray-200 divide-y divide-gray-200">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 text-[17px] font-bold text-gray-900 marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown
                    className="size-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="pb-4 max-w-3xl text-[15px] leading-relaxed text-gray-700">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-gray-500">
            {site.contentDisclosure}
          </p>
        </section>

        {/* Empty state */}
        {recentContent.length === 0 && featuredProducts.length === 0 && (
          <div className="py-16 text-center text-gray-500">
            <p className="text-lg">No content yet</p>
          </div>
        )}
      </div>
    </main>
  );
}

function ToolRow({
  product,
  index,
  sourceType,
}: {
  product: ProductRow;
  index: number;
  sourceType: string;
}) {
  const isTop = index === 0;
  return (
    <div
      className={`group grid grid-cols-1 items-start gap-5 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 sm:grid-cols-[auto_1fr_auto] sm:items-center ${
        isTop
          ? "border-[color:var(--color-accent,#16A34A)]/30 bg-white shadow-md"
          : "border-gray-200 bg-white hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
            isTop
              ? "bg-[color:var(--color-accent,#16A34A)] text-white"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {index + 1}
        </span>
        <ProductLogo
          name={product.name}
          src={product.image_url}
          size={48}
          className="rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-100"
          priority={index < 3}
        />
      </div>

      <div className="min-w-0">
        {isTop && (
          <span className="mb-1 inline-flex items-center rounded bg-[color:var(--color-accent,#16A34A)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Recommended
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-bold text-gray-900">{product.name}</p>
          {BEST_FOR[product.slug] && (
            <span className="rounded-full bg-[color:var(--color-accent,#16A34A)]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-accent-text,#15803D)]">
              {BEST_FOR[product.slug]}
            </span>
          )}
        </div>
        {product.description && (
          <p className="mt-1 max-w-[60ch] text-sm text-gray-600">{product.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-3">
        {product.score !== null && (
          <div className="text-2xl font-extrabold text-gray-900">
            {product.score.toFixed(1)}
            <span className="text-sm font-medium text-gray-500">/10</span>
          </div>
        )}
        {hasUsableAffiliateUrl(product.affiliate_url) && (
          <ProductCardCta
            href={product.affiliate_url}
            slug={product.slug}
            sourceType={sourceType}
            label={`Visit ${product.name} →`}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] ${
              isTop
                ? "text-white shadow-sm hover:opacity-90"
                : "border border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50"
            }`}
            style={isTop ? { backgroundColor: "var(--color-accent, #16A34A)" } : undefined}
          />
        )}
      </div>
    </div>
  );
}

function categoryIcon(slug: string) {
  switch (slug) {
    case "crypto-tax-basics":
      return BookOpen;
    case "defi-tax":
      return ArrowRightLeft;
    case "staking-tax":
      return Coins;
    case "airdrop-tax":
      return Gift;
    case "nft-tax":
      return ImageIcon;
    case "crypto-tax-software":
      return Calculator;
    case "crypto-accountants":
      return UserCheck;
    default:
      return ShieldCheck;
  }
}

function TrustBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700">
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-[color:var(--color-accent,#16A34A)]/10">
        <Check className="size-3.5 text-[color:var(--color-accent,#16A34A)]" aria-hidden="true" />
      </span>
      {text}
    </span>
  );
}
