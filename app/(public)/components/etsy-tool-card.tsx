import Image from "next/image";
import Link from "next/link";
import type { EtsyTool } from "@/lib/etsy-product-data";
import {
  getEtsyComparisonsByToolSlug,
  getEtsyReviewByToolSlug,
  getEtsyToolStartingPrice,
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

  const brandColor = tool.brandColor ?? "var(--color-accent, #2D6BF0)";
  const initial = tool.name.charAt(0).toUpperCase();

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div
        className="relative flex aspect-[3/2] items-center justify-center text-white"
        style={{ backgroundColor: brandColor }}
      >
        {tool.imageUrl ? (
          <Image
            src={tool.imageUrl}
            alt={tool.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <>
            <span className="text-5xl font-bold opacity-30" aria-hidden="true">
              {initial}
            </span>
            <span className="sr-only">{tool.name}</span>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{tool.name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{tool.tagline}</p>
          </div>
        </div>

        <p className="mt-3 text-sm text-gray-500">
          Starting at{" "}
          <span className="font-semibold text-gray-900">
            {startingPrice.monthlyUsd > 0 ? `$${startingPrice.monthlyUsd.toFixed(2)}/mo` : "Free"}
          </span>{" "}
          on {startingPrice.name}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {tool.bestFor.slice(0, 2).map((item) => (
            <span
              key={item}
              className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
            >
              {item}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-4">
          <ProductCardCta
            href={href}
            slug={tool.slug}
            sourceType="tool-directory"
            placement="tools-page"
            productName={tool.name}
            label={affiliateReady ? `Get ${tool.name}` : `Visit ${tool.name}`}
            className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {review && (
              <Link
                href={`/review/${review.slug}`}
                className="hover:text-gray-900 hover:underline"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                Read review
              </Link>
            )}
            {comparisons.slice(0, 1).map((comparison) => (
              <Link
                key={comparison.slug}
                href={`/comparison/${comparison.slug}`}
                className="hover:text-gray-900 hover:underline"
                style={{ color: "var(--color-accent-text, var(--color-accent))" }}
              >
                See comparison
              </Link>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
