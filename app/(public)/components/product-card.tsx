import type { ProductRow } from "@/types/database";

interface ProductCardProps {
  product: ProductRow;
  siteId: string;
}

function buildTrackingUrl(product: ProductRow): string {
  const dest = Buffer.from(product.affiliate_url).toString("base64");
  return `/api/track/click?p=${encodeURIComponent(product.slug)}&d=${encodeURIComponent(dest)}&t=product-card`;
}

export function ProductCard({ product }: ProductCardProps) {
  const trackUrl = product.affiliate_url
    ? buildTrackingUrl(product)
    : "#";

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {product.image_url && (
        <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-contain"
          />
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-900">{product.name}</h3>

      {product.description && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{product.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-3">
        <div className="flex items-center gap-2">
          {product.price && (
            <span className="text-sm font-medium text-gray-900">{product.price}</span>
          )}
          {product.score !== null && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
              {product.score}/10
            </span>
          )}
        </div>

        {product.affiliate_url && (
          <a
            href={trackUrl}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: "var(--color-accent)" }}
            rel="nofollow noopener"
          >
            View Deal
          </a>
        )}
      </div>

      {product.merchant && (
        <p className="mt-2 text-xs text-gray-400">via {product.merchant}</p>
      )}
    </div>
  );
}
