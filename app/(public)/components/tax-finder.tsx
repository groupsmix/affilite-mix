"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, Calculator, Check } from "lucide-react";
import { ProductCardCta } from "./product-card-client";
import { ProductLogo } from "./product-logo";

/**
 * A tool the finder can send the visitor to. `slug`/`affiliateUrl` come from the
 * seeded products so the outbound clicks are the same tracked affiliate links
 * used everywhere else on the site.
 */
export interface TaxFinderTool {
  slug: string;
  name: string;
  affiliateUrl: string;
  tagline: string;
  imageUrl?: string | null;
}

export type TopicKey = "trade" | "defi" | "staking" | "airdrop" | "nft";

interface TaxFinderProps {
  /** Software tools the finder can recommend (from seeded featured products). */
  tools: TaxFinderTool[];
  /** Optional crypto-accountant referral, offered as a secondary route. */
  accountant?: TaxFinderTool | null;
  /** Per-topic guide links (from seeded categories), keyed by topic. */
  guideHrefs?: Partial<Record<TopicKey, string>>;
  /** Days until the 31 October self-lodgement deadline (computed server-side). */
  daysToDeadline: number;
  affiliateDisclosure: string;
  sourceType?: string;
}

/**
 * One topic = one thing the visitor did with crypto. Each carries the plain ATO
 * line and the software slug best suited to it. Single choice → straight to the
 * tool + guide; no multi-step questionnaire.
 */
const TOPICS: {
  k: TopicKey;
  label: string;
  ato: string;
  toolSlug: string;
}[] = [
  {
    k: "trade",
    label: "Bought & sold",
    ato: "Capital gains tax (CGT) on each disposal when you sell or swap.",
    toolSlug: "koinly",
  },
  {
    k: "defi",
    label: "DeFi (swaps, LPs, lending)",
    ato: "CGT on swaps and entering/exiting liquidity pools; ordinary income on some DeFi rewards and yield.",
    toolSlug: "crypto-tax-calculator",
  },
  {
    k: "staking",
    label: "Staking rewards",
    ato: "Rewards are ordinary income at their AUD value when received; CGT later when you dispose of them.",
    toolSlug: "koinly",
  },
  {
    k: "airdrop",
    label: "Airdrops",
    ato: "Established-project airdrops are ordinary income at market value on receipt; CGT on later disposal.",
    toolSlug: "koinly",
  },
  {
    k: "nft",
    label: "NFTs",
    ato: "CGT on NFT sales (possible personal-use-asset treatment); income if you mint or create as a business.",
    toolSlug: "koinly",
  },
];

const chip =
  "rounded-full border px-5 py-3 text-[15px] font-semibold transition-all cursor-pointer select-none active:scale-[0.98]";

export function TaxFinder({
  tools,
  accountant,
  guideHrefs,
  daysToDeadline,
  affiliateDisclosure,
  sourceType = "homepage",
}: TaxFinderProps) {
  const [topic, setTopic] = useState<TopicKey | null>(null);

  const bySlug = useMemo(() => {
    const m = new Map<string, TaxFinderTool>();
    for (const t of tools) m.set(t.slug, t);
    return m;
  }, [tools]);

  const selected = topic ? TOPICS.find((t) => t.k === topic) : null;
  const pick = selected ? (bySlug.get(selected.toolSlug) ?? tools[0] ?? null) : null;
  const guideHref = topic ? guideHrefs?.[topic] : undefined;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7">
      <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <Calculator className="size-6 text-emerald-700" aria-hidden="true" />
          <p className="text-xl font-bold text-slate-900">What did you do with crypto?</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          {daysToDeadline} days to 31 Oct
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Pick one activity to see the ATO rule and the software built for it.
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {TOPICS.map((t) => {
          const on = topic === t.k;
          return (
            <button
              type="button"
              key={t.k}
              aria-pressed={on}
              onClick={() => setTopic(t.k)}
              className={`${chip} ${
                on
                  ? "border-emerald-700 bg-emerald-700 text-white shadow-md ring-2 ring-emerald-700 ring-offset-2 ring-offset-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:bg-emerald-50"
              }`}
            >
              <span className="flex items-center gap-2">
                {on && <Check className="size-4" aria-hidden="true" />}
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-5 grid items-start gap-4 border-t border-gray-100 pt-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
              What the ATO taxes
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-700">{selected.ato}</p>
            {guideHref && (
              <Link
                href={guideHref}
                className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline"
              >
                Read the {selected.label.toLowerCase()} tax guide →
              </Link>
            )}
          </div>

          {pick && (
            <div className="relative rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.04em] text-emerald-700">
                <BadgeCheck className="size-4" aria-hidden="true" />
                Best tool for {selected.label}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <ProductLogo
                  name={pick.name}
                  src={pick.imageUrl}
                  size={48}
                  className="rounded-lg bg-white p-1 shadow-sm"
                  priority
                />
                <div>
                  <p className="text-xl font-extrabold text-gray-900">{pick.name}</p>
                  {pick.tagline && <p className="text-sm text-gray-600">{pick.tagline}</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <ProductCardCta
                  href={pick.affiliateUrl}
                  slug={pick.slug}
                  sourceType={sourceType}
                  productName={pick.name}
                  label={
                    <span className="inline-flex items-center justify-center gap-2">
                      Get started <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  }
                  className="block w-full rounded-lg border border-slate-900 bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.98]"
                />
                {accountant && (
                  <ProductCardCta
                    href={accountant.affiliateUrl}
                    slug={accountant.slug}
                    sourceType={sourceType}
                    productName={accountant.name}
                    label={
                      <span className="inline-flex items-center justify-center gap-2">
                        Find an accountant
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </span>
                    }
                    className="block w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {affiliateDisclosure && (
        <p className="mt-5 border-t border-slate-100 pt-4 text-[11.5px] leading-relaxed text-slate-500">
          {affiliateDisclosure}
        </p>
      )}
    </div>
  );
}
