import Image from "next/image";
import Link from "next/link";
import type { EtsyTool } from "@/lib/etsy-product-data";
import {
  getEtsyComparisonsByToolSlug,
  getEtsyReviewByToolSlug,
  getEtsyToolStartingPrice,
  formatCurrencyUSD,
} from "@/lib/etsy-product-data";
import { getProductUrl, isAffiliateLinkReady } from "@/lib/etsy-affiliate-links";
import { ProductCardCta } from "./product-card-client";

interface EtsyToolCardProps {
  tool: EtsyTool;
}

export function EtsyToolCard({ tool }: EtsyToolCardProps) {
  const review = getEtsyReviewByToolSlug(tool.slug);
  const comparisons = getEtsyComparisonsByToolSlug(tool.slug);
  const startingPrice = getEtsyToolStartingPrice(tool);
  const href = getProductUrl(tool.slug);
  const affiliateReady = isAffiliateLinkReady(tool.slug);

  const priceText =
    startingPrice.monthlyUsd > 0
      ? `From ${formatCurrencyUSD(startingPrice.monthlyUsd)}/mo · ${startingPrice.name}`
      : "Free";

  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50">
          {tool.logoUrl ? (
            <Image
              src={tool.logoUrl}
              alt=""
              width={40}
              height={40}
              className="h-8 w-auto max-w-[2.25rem] object-contain"
            />
          ) : (
            <span className="text-lg font-bold text-slate-300">
              {tool.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{tool.name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{tool.tagline}</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-600">{priceText}</p>

      <div className="mt-auto pt-5">
        <ProductCardCta
          href={href}
          slug={tool.slug}
          sourceType="tool-directory"
          placement="homepage"
          productName={tool.name}
          label={affiliateReady ? `Get ${tool.name}` : `Visit ${tool.name}`}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent,#2D6BF0)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-light,#3B82F6)]"
        />

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          {review && (
            <Link href={`/review/${review.slug}`} className="hover:text-slate-900">
              Read review
            </Link>
          )}
          {comparisons.slice(0, 1).map((comparison) => (
            <Link
              key={comparison.slug}
              href={`/comparison/${comparison.slug}`}
              className="hover:text-slate-900"
            >
              See comparison
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
