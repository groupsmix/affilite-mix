import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";
import { ContentCard } from "./content-card";
import { ProductCardCta } from "./product-card-client";
import { ProductLogo } from "./product-logo";
import {
  BookOpen,
  ArrowRight,
  ChevronDown,
  Coins,
  Gift,
  Image as ImageIcon,
  Calculator,
  ShieldCheck,
  UserCheck,
  Network,
  Check,
} from "lucide-react";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "./json-ld";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { TaxFinder, type TaxFinderTool, type TopicKey } from "./tax-finder";
import { HeroImage } from "./hero-image";
import { TrustSignals } from "./trust-signals";
import { ScoreRing } from "./score-ring";
import { StarRating } from "./star-rating";
import { CRYPTO_TAX_PRODUCT_FEATURES } from "@/lib/crypto-tax-au-tools";

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

function parseBulletList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const subScoreLabel: Record<string, string> = {
  features: "Features",
  pricing: "Pricing",
  support: "Support",
  ato: "ATO report",
};

export function TaxFinderHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
}: TaxFinderHomepageProps) {
  const firstContentType =
    site.contentTypes.find((c) => c.value === "guide")?.value ??
    site.contentTypes[0]?.value ??
    "guide";
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
    <main className="bg-[#F8F9FA]">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* Hero + Finder */}
      <section className="border-b border-slate-200 bg-[#F8F9FA] pt-10 pb-12 sm:pt-12 sm:pb-16 lg:pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[13.5px] font-semibold uppercase tracking-[0.04em] text-emerald-700">
                  Australian crypto tax
                </p>
                <h1 className="mt-3 max-w-[20ch] text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                  Find the right crypto tax tool for your ATO return.
                </h1>
                <p className="mt-4 max-w-[55ch] text-lg leading-relaxed text-slate-600">
                  Pick what you did with crypto. We&apos;ll show your taxable events and the
                  software built for it.
                </p>
              </div>

              <TaxFinder
                tools={finderTools}
                accountant={accountant}
                guideHrefs={guideHrefs}
                daysToDeadline={days}
                affiliateDisclosure=""
                sourceType="homepage-finder"
              />
            </div>

            <div className="lg:sticky lg:top-28">
              <HeroImage />
            </div>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <TrustSignals
        affiliateDisclosure={site.affiliateDisclosure}
        contentDisclosure={site.contentDisclosure}
        contactEmail={site.brand.contactEmail}
      />

      {/* Comparison */}
      {ranked.length > 0 && (
        <section id="compare" className="border-y border-slate-200 bg-[#F8F9FA] py-12 lg:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Compare every tool
              </h2>
              <p className="mt-2 max-w-[55ch] text-slate-600">
                Editorial ratings, feature breakdowns and quick pros & cons so you can choose with
                confidence.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {ranked.map((p, i) => (
                <ToolRow key={p.id} product={p} index={i} sourceType="homepage-compare" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Topic hubs */}
      {categories.length > 0 && (
        <section className="border-b border-slate-200 bg-white py-12 lg:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Crypto tax by transaction type
            </h2>
            <p className="mt-2 max-w-[55ch] text-slate-600">
              Go deeper on how the ATO treats each one.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {categories
                .filter((cat) => CATEGORY_ORDER.includes(cat.slug))
                .sort((a, b) => CATEGORY_ORDER.indexOf(a.slug) - CATEGORY_ORDER.indexOf(b.slug))
                .slice(0, 7)
                .map((cat, i) => {
                  const { Icon, iconBg, iconText, iconRing, hoverBg, hoverText, labelColor } =
                    categoryStyle(cat.slug);
                  return (
                    <Link
                      key={cat.id}
                      href={`/category/${cat.slug}`}
                      className={`group flex flex-col rounded-2xl border border-slate-200 bg-[#F8F9FA] p-5 transition-all hover:-translate-y-1 hover:border-slate-300 hover:bg-white hover:shadow-lg ${
                        i === 0 ? "sm:col-span-2" : ""
                      }`}
                    >
                      <span
                        className={`inline-flex size-10 items-center justify-center rounded-lg ${iconBg} ${iconText} ring-1 ${iconRing} transition-colors ${hoverBg} ${hoverText}`}
                      >
                        <Icon className="size-5" aria-hidden={true} />
                      </span>
                      <h3 className="mt-3 font-bold text-slate-900">{cat.name}</h3>
                      {cat.description && (
                        <p className="mt-1 line-clamp-2 text-[13px] text-slate-500">
                          {cat.description}
                        </p>
                      )}
                      <span
                        className={`mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-semibold ${labelColor} group-hover:underline`}
                      >
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
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                  Popular guides
                </h2>
                <p className="mt-2 text-slate-600">
                  Plain-English answers for Australian investors.
                </p>
              </div>
              <Link
                href={`/${firstContentType}`}
                className="shrink-0 text-sm font-semibold text-emerald-700 hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentContent.map((content) => (
                <ContentCard key={content.id} content={content} locale="en-AU" priority={false} />
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="pb-16 pt-4">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Common questions
          </h2>
          <div className="mt-5 divide-y divide-slate-200 border-t border-slate-200">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 text-[17px] font-bold text-slate-900 marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown
                    className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="pb-4 max-w-3xl text-[15px] leading-relaxed text-slate-700">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Empty state */}
        {recentContent.length === 0 && featuredProducts.length === 0 && (
          <div className="py-16 text-center text-slate-500">
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
  const slugData = CRYPTO_TAX_PRODUCT_FEATURES[product.slug];
  const subScores = slugData?.subScores;
  const pros = parseBulletList(product.pros);
  const cons = parseBulletList(product.cons);

  return (
    <div
      className={`group grid grid-cols-1 items-start gap-5 rounded-2xl border p-5 transition-all sm:grid-cols-[auto_1fr_auto] ${
        isTop
          ? "border-emerald-300 bg-white shadow-md"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
            isTop ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {index + 1}
        </span>
        <ProductLogo
          name={product.name}
          src={product.image_url}
          size={48}
          className="rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-100"
          priority={index < 3}
        />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {isTop && (
            <span className="inline-flex items-center rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Recommended
            </span>
          )}
          <p className="text-lg font-bold text-slate-900">{product.name}</p>
          {BEST_FOR[product.slug] && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-slate-200">
              {BEST_FOR[product.slug]}
            </span>
          )}
        </div>
        {product.description && (
          <p className="mt-1 max-w-[60ch] text-sm text-slate-600">{product.description}</p>
        )}

        {(pros.length > 0 || cons.length > 0) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {pros.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Pros</p>
                <ul className="mt-2 space-y-1.5">
                  {pros.slice(0, 3).map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cons.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cons</p>
                <ul className="mt-2 space-y-1.5">
                  {cons.slice(0, 3).map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm text-slate-600">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400"
                        aria-hidden="true"
                      />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-4 sm:w-56">
        {product.score !== null && (
          <div className="flex flex-col gap-1">
            <ScoreRing score={product.score} size="md" label="Editorial score" />
            <StarRating score={product.score / 2} size="sm" />
          </div>
        )}

        {subScores && (
          <div className="w-full space-y-1.5">
            {Object.entries(subScores).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 font-medium text-slate-500">
                  {subScoreLabel[key] ?? key}
                </span>
                <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(10, value) * 10}%` }}
                  />
                </div>
                <span className="w-5 shrink-0 text-right font-semibold text-slate-700">
                  {value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}

        {hasUsableAffiliateUrl(product.affiliate_url) && (
          <ProductCardCta
            href={product.affiliate_url}
            slug={product.slug}
            sourceType={sourceType}
            productName={product.name}
            label={
              <span className="inline-flex items-center justify-center gap-2">
                Visit site <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            }
            className="mt-auto inline-flex w-full items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow active:scale-[0.98]"
          />
        )}
      </div>
    </div>
  );
}

type CategoryStyle = {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconBg: string;
  iconText: string;
  iconRing: string;
  hoverBg: string;
  hoverText: string;
  labelColor: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  "crypto-tax-basics": {
    Icon: BookOpen,
    iconBg: "bg-blue-50",
    iconText: "text-blue-700",
    iconRing: "ring-blue-100",
    hoverBg: "group-hover:bg-blue-600",
    hoverText: "group-hover:text-white",
    labelColor: "text-blue-700",
  },
  "defi-tax": {
    Icon: Network,
    iconBg: "bg-violet-50",
    iconText: "text-violet-700",
    iconRing: "ring-violet-100",
    hoverBg: "group-hover:bg-violet-600",
    hoverText: "group-hover:text-white",
    labelColor: "text-violet-700",
  },
  "staking-tax": {
    Icon: Coins,
    iconBg: "bg-amber-50",
    iconText: "text-amber-700",
    iconRing: "ring-amber-100",
    hoverBg: "group-hover:bg-amber-600",
    hoverText: "group-hover:text-white",
    labelColor: "text-amber-700",
  },
  "airdrop-tax": {
    Icon: Gift,
    iconBg: "bg-sky-50",
    iconText: "text-sky-700",
    iconRing: "ring-sky-100",
    hoverBg: "group-hover:bg-sky-600",
    hoverText: "group-hover:text-white",
    labelColor: "text-sky-700",
  },
  "nft-tax": {
    Icon: ImageIcon,
    iconBg: "bg-pink-50",
    iconText: "text-pink-700",
    iconRing: "ring-pink-100",
    hoverBg: "group-hover:bg-pink-600",
    hoverText: "group-hover:text-white",
    labelColor: "text-pink-700",
  },
  "crypto-tax-software": {
    Icon: Calculator,
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-700",
    iconRing: "ring-emerald-100",
    hoverBg: "group-hover:bg-emerald-600",
    hoverText: "group-hover:text-white",
    labelColor: "text-emerald-700",
  },
  "crypto-accountants": {
    Icon: UserCheck,
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-700",
    iconRing: "ring-indigo-100",
    hoverBg: "group-hover:bg-indigo-600",
    hoverText: "group-hover:text-white",
    labelColor: "text-indigo-700",
  },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_STYLES);

function categoryStyle(slug: string): CategoryStyle {
  return (
    CATEGORY_STYLES[slug] ?? {
      Icon: ShieldCheck,
      iconBg: "bg-slate-50",
      iconText: "text-slate-700",
      iconRing: "ring-slate-100",
      hoverBg: "group-hover:bg-slate-600",
      hoverText: "group-hover:text-white",
      labelColor: "text-slate-700",
    }
  );
}
