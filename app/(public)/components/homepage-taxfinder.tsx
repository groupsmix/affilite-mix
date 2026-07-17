import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow, CategoryRow } from "@/types/database";
import { ContentCard } from "./content-card";
import { ProductCardCta } from "./product-card-client";
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

/** Slugs the finder can recommend as software; anything else (e.g. the
 *  accountant referral) is surfaced separately as a complex-case upsell. */
const SOFTWARE_SLUGS = new Set([
  "koinly",
  "syla",
  "crypto-tax-calculator",
  "coinledger",
  "cointracking",
  "coinpanda",
]);
const ACCOUNTANT_SLUG = "crypto-accountant-au";

/** One-line "best for" positioning per tool, so the comparison is scannable. */
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
  return { slug: p.slug, name: p.name, affiliateUrl: p.affiliate_url, tagline: p.price };
}

/**
 * "Tax finder" homepage — a situation-triage answer engine for the Australian
 * crypto-tax site (crypto-tools tenant, cryptoranked.xyz).
 *
 * Design intent: the visitor arrives confused and anxious near a deadline. The
 * first view is not a decorative hero but an interactive triage — pick what you
 * did with crypto → see your likely ATO taxable events → get the single tool
 * built for your situation, with the tracked affiliate CTA. That situation →
 * ATO-events → best-tool mapping is what makes the page specific to this
 * business (and drives the affiliate conversion). The full comparison, topic
 * hubs and guides sit below for people who prefer to browse. Deliberately plain
 * and readable — the interaction, not ornament, carries the differentiation.
 */
export function TaxFinderHomepage({
  site,
  recentContent,
  featuredProducts,
  categories,
  productCount,
  reviewCount,
}: TaxFinderHomepageProps) {
  const firstContentType = site.contentTypes[0]?.value ?? "guide";
  const usable = featuredProducts.filter((p) => hasUsableAffiliateUrl(p.affiliate_url));

  const softwareProducts = usable.filter((p) => SOFTWARE_SLUGS.has(p.slug));
  const finderTools = (softwareProducts.length > 0 ? softwareProducts : usable)
    .filter((p) => p.slug !== ACCOUNTANT_SLUG)
    .map(toFinderTool);
  const accountantRow = usable.find((p) => p.slug === ACCOUNTANT_SLUG);
  const accountant = accountantRow ? toFinderTool(accountantRow) : null;

  // Link each topic to its seeded category guide (matched by slug keyword).
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

  // Ranked comparison rows: software first (by score), then any remaining.
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
    <div>
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={webSiteJsonLd(site)} />

      {/* ── Triage: the answer engine ── */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
          <p className="text-[13.5px] font-semibold uppercase tracking-[0.04em] text-[color:var(--color-accent-text,#15803D)]">
            Australian crypto tax
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-4xl">
            Crypto tax software for Australians — pick what you did, get the right tool.
          </h1>
          <p className="mt-3 max-w-2xl text-[17px] text-gray-600">
            For DeFi, staking, airdrop and NFT investors. Choose your activity below to see what the
            ATO taxes and go straight to the software built for it.
          </p>

          <div className="mt-7">
            <TaxFinder
              tools={finderTools}
              accountant={accountant}
              guideHrefs={guideHrefs}
              daysToDeadline={days}
              affiliateDisclosure={site.affiliateDisclosure}
              sourceType="homepage-finder"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <Check /> Based on current ATO rules
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check /> DeFi, staking, airdrops &amp; NFTs
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check /> No sign-up to use
            </span>
            {ranked.length > 0 && (
              <a
                href="#compare"
                className="font-semibold text-[color:var(--color-accent-text,#15803D)] hover:underline"
              >
                Or compare all {ranked.length} tools ↓
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── Full comparison ── */}
        {ranked.length > 0 && (
          <section id="compare" className="py-12">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
              Compare every tool
            </h2>
            <p className="mt-1.5 text-gray-600">The full ranking, if you&apos;d rather browse.</p>
            <div className="mt-6 flex flex-col gap-3">
              {ranked.map((p, i) => (
                <div
                  key={p.id}
                  className={`grid items-center gap-4 rounded-xl border bg-white p-4 sm:grid-cols-[32px_1fr_88px_170px] ${
                    i === 0 ? "border-[color:var(--color-accent,#16A34A)]" : "border-gray-200"
                  }`}
                >
                  <div className="text-center text-lg font-extrabold text-gray-400">{i + 1}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[17px] font-bold text-gray-900">{p.name}</p>
                      {BEST_FOR[p.slug] && (
                        <span className="rounded-full bg-[color:var(--color-accent,#16A34A)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--color-accent-text,#15803D)]">
                          {BEST_FOR[p.slug]}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-gray-600">{p.description}</p>
                    )}
                  </div>
                  <div className="text-center sm:text-center">
                    {p.score !== null && (
                      <>
                        <span className="text-xl font-extrabold text-gray-900">
                          {p.score.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-500">/10</span>
                      </>
                    )}
                  </div>
                  <ProductCardCta
                    href={p.affiliate_url}
                    slug={p.slug}
                    sourceType="homepage-compare"
                    label={p.cta_text || `Visit ${p.name} →`}
                    className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-opacity hover:opacity-90 ${
                      i === 0 ? "text-white" : "border border-gray-200 text-gray-800"
                    }`}
                    style={
                      i === 0 ? { backgroundColor: "var(--color-accent, #16A34A)" } : undefined
                    }
                  />
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-gray-500">
              {site.affiliateDisclosure}
            </p>
          </section>
        )}
      </div>

      {/* ── Topic hubs ── */}
      {categories.length > 0 && (
        <section className="border-y border-gray-200 bg-gray-50">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
              Crypto tax by transaction type
            </h2>
            <p className="mt-1.5 text-gray-600">Go deeper on how the ATO treats each one.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.slice(0, 8).map((cat) => (
                <Link
                  key={cat.id}
                  href={`/category/${cat.slug}`}
                  className="rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-[color:var(--color-accent,#16A34A)]"
                >
                  <h3 className="font-bold text-gray-900">{cat.name}</h3>
                  {cat.description && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-gray-500">{cat.description}</p>
                  )}
                  <span className="mt-2.5 inline-block text-[13px] font-semibold text-[color:var(--color-accent-text,#15803D)]">
                    Learn more →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* ── Popular guides ── */}
        {recentContent.length > 0 && (
          <section className="py-12">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
                  Popular guides
                </h2>
                <p className="mt-1.5 text-gray-600">
                  Plain-English answers written for Australian investors.
                </p>
              </div>
              <Link
                href={`/${firstContentType}`}
                className="shrink-0 text-sm font-semibold text-[color:var(--color-accent-text,#15803D)] hover:underline"
              >
                View all →
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentContent.map((content) => (
                <ContentCard key={content.id} content={content} locale="en-AU" priority={false} />
              ))}
            </div>
          </section>
        )}

        {/* ── FAQ ── */}
        <section className="pb-16 pt-4">
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Common questions</h2>
          <dl className="mt-4 border-t border-gray-200">
            {faqs.map((f) => (
              <div key={f.q} className="border-b border-gray-200 py-4">
                <dt className="text-[17px] font-bold text-gray-900">{f.q}</dt>
                <dd className="mt-1.5 max-w-3xl text-[15px] text-gray-700">{f.a}</dd>
              </div>
            ))}
          </dl>
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
    </div>
  );
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4 shrink-0 text-[color:var(--color-accent,#16A34A)]"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
