import Image from "next/image";
import Link from "next/link";
import { BookOpen, ArrowLeftRight } from "lucide-react";
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
      ? `From ${formatCurrencyUSD(startingPrice.monthlyUsd)}/mo`
      : "Free";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
          {tool.logoUrl ? (
            <Image
              src={tool.logoUrl}
              alt={tool.name}
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

      <p className="mt-4 text-sm text-slate-600">
        {priceText}
        {startingPrice.name && startingPrice.name !== "Free" ? (
          <span className="text-slate-500"> · {startingPrice.name}</span>
        ) : null}
      </p>

      {tool.bestFor.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tool.bestFor.slice(0, 2).map((item) => (
            <span
              key={item}
              className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-5">
        <ProductCardCta
          href={href}
          slug={tool.slug}
          sourceType="tool-directory"
          placement="homepage"
          productName={tool.name}
          label={affiliateReady ? `Get ${tool.name}` : `Visit ${tool.name}`}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent,#2D6BF0)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-light,#3B82F6)] focus:ring-offset-2"
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {review && (
            <Link
              href={`/review/${review.slug}`}
              className="inline-flex items-center gap-1 text-slate-500 transition-colors hover:text-[var(--color-accent-text,#1B49C7)]"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Read review
            </Link>
          )}
          {comparisons.slice(0, 1).map((comparison) => (
            <Link
              key={comparison.slug}
              href={`/comparison/${comparison.slug}`}
              className="inline-flex items-center gap-1 text-slate-500 transition-colors hover:text-[var(--color-accent-text,#1B49C7)]"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              See comparison
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
