import type { ProductRow } from "@/types/database";
import type { ReactNode } from "react";
import { GiftWorthinessScore } from "./gift-worthiness-score";
import { highlightText } from "./highlight-text";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { ProductCardCta, ProductCardImage, ProductCardDealBadge } from "./product-card-client";

export interface ProductCardProps {
  product: ProductRow;
  sourceType?: string;
  ctaLabel?: string;
  /** Optional link to a related review/article for this product */
  relatedContentHref?: string;
  relatedContentLabel?: string;
  /** Optional search query to highlight matching terms */
  searchQuery?: string;
  /** Mark as above-the-fold for LCP optimisation */
  priority?: boolean;
  /** Card display variant. Defaults to "standard". */
  variant?: "standard" | "compact" | "detailed";
}

export function ProductCard({
  product,
  sourceType = "content",
  ctaLabel = "View Deal",
  relatedContentHref,
  relatedContentLabel,
  searchQuery,
  priority = false,
  variant = "standard",
}: ProductCardProps): ReactNode {
  const buttonLabel = product.cta_text || ctaLabel;

  function Name() {
    if (!searchQuery) return product.name;
    return highlightText(product.name, searchQuery);
  }

  if (variant === "compact") {
    return (
      <div className="relative flex gap-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
        {product.deal_text && (
          <ProductCardDealBadge
            dealText={product.deal_text}
            dealExpiresAt={product.deal_expires_at}
          />
        )}
        {product.image_url && (
          <div className="shrink-0 overflow-hidden rounded-md">
            <ProductCardImage
              src={product.image_url}
              alt={product.image_alt || product.name}
              width={80}
              height={80}
              sizes="80px"
              className="size-20 object-contain"
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              fallbackClassName="flex size-20 items-center justify-center bg-gray-100 text-gray-400"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">
            <Name />
          </h3>
          {product.merchant && <p className="text-xs text-gray-500">{product.merchant}</p>}
          <div className="mt-1 flex items-center gap-2">
            {product.price && (
              <span className="text-sm font-bold" style={{ color: "var(--color-accent, #10B981)" }}>
                {product.price}
              </span>
            )}
            {product.score !== null && (
              <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
            )}
          </div>
          {hasUsableAffiliateUrl(product.affiliate_url) && (
            <ProductCardCta
              href={product.affiliate_url}
              slug={product.slug}
              sourceType={sourceType}
              label={buttonLabel}
              className="mt-2 inline-block rounded px-3 py-1 text-xs font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent, #10B981)" }}
            />
          )}
        </div>
      </div>
    );
  }

  if (variant === "detailed") {
    const prosArr = product.pros
      ? product.pros
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const consArr = product.cons
      ? product.cons
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return (
      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
        {product.deal_text && (
          <ProductCardDealBadge
            dealText={product.deal_text}
            dealExpiresAt={product.deal_expires_at}
          />
        )}
        {product.image_url && (
          <div className="overflow-hidden">
            <ProductCardImage
              src={product.image_url}
              alt={product.image_alt || product.name}
              width={400}
              height={200}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="h-48 w-full object-contain"
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              fallbackClassName="flex h-48 w-full items-center justify-center bg-gray-100 text-gray-400"
            />
          </div>
        )}
        <div className="p-4">
          <h3 className="mb-1 text-lg font-semibold leading-tight">
            <Name />
          </h3>
          {product.merchant && <p className="mb-1 text-sm text-gray-500">{product.merchant}</p>}
          {product.description && (
            <p className="mb-3 line-clamp-2 text-sm text-gray-600">{product.description}</p>
          )}
          <div className="mb-3 flex items-center gap-3">
            {product.price && (
              <span className="text-lg font-bold" style={{ color: "var(--color-accent, #10B981)" }}>
                {product.price}
              </span>
            )}
            {product.score !== null && (
              <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
            )}
          </div>

          {/* Pros/Cons inline */}
          {(prosArr.length > 0 || consArr.length > 0) && (
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              {prosArr.length > 0 && (
                <ul className="space-y-0.5">
                  {prosArr.slice(0, 3).map((pro) => (
                    <li
                      key={pro}
                      className="flex items-start gap-1"
                      style={{ color: "var(--color-accent-text, #059669)" }}
                    >
                      <svg
                        className="mt-0.5 size-3 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{pro}</span>
                    </li>
                  ))}
                </ul>
              )}
              {consArr.length > 0 && (
                <ul className="space-y-0.5">
                  {consArr.slice(0, 3).map((con) => (
                    <li key={con} className="flex items-start gap-1 text-red-600">
                      <svg
                        className="mt-0.5 size-3 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasUsableAffiliateUrl(product.affiliate_url) && (
            <ProductCardCta
              href={product.affiliate_url}
              slug={product.slug}
              sourceType={sourceType}
              label={buttonLabel}
              className="block w-full rounded-md px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent, #10B981)" }}
            />
          )}
          {relatedContentHref && (
            <a
              href={relatedContentHref}
              className="mt-2 block text-center text-xs font-medium transition-colors hover:underline"
              style={{ color: "var(--color-accent, #10B981)" }}
            >
              {relatedContentLabel ?? "Read our review →"}
            </a>
          )}
        </div>
      </div>
    );
  }

  // Standard variant (default)
  return (
    <div className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* Deal badge */}
      {product.deal_text && (
        <ProductCardDealBadge
          dealText={product.deal_text}
          dealExpiresAt={product.deal_expires_at}
        />
      )}
      {product.image_url && (
        <div className="mb-4 flex h-40 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-white p-4">
          <ProductCardImage
            src={product.image_url}
            alt={product.image_alt || product.name}
            width={200}
            height={100}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="max-h-full max-w-full object-contain"
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            fallbackClassName="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400"
          />
        </div>
      )}
      <h3 className="mb-1 text-lg font-bold leading-tight tracking-tight">
        <Name />
      </h3>
      {product.merchant && <p className="mb-1 text-sm text-gray-500">{product.merchant}</p>}
      <div className="mb-3 flex items-center gap-3">
        {product.price && (
          <span className="text-lg font-bold" style={{ color: "var(--color-accent, #10B981)" }}>
            {product.price}
          </span>
        )}
        {product.score !== null && (
          <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
        )}
      </div>
      {hasUsableAffiliateUrl(product.affiliate_url) && (
        <ProductCardCta
          href={product.affiliate_url}
          slug={product.slug}
          sourceType={sourceType}
          label={buttonLabel}
          className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: "var(--color-accent, #16A34A)" }}
        />
      )}
      {relatedContentHref && (
        <a
          href={relatedContentHref}
          className="mt-2 block text-center text-xs font-medium transition-colors hover:underline"
          style={{ color: "var(--color-accent, #10B981)" }}
        >
          {relatedContentLabel ?? "Read our review →"}
        </a>
      )}
    </div>
  );
}
