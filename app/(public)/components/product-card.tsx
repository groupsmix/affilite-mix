import type { ProductRow } from "@/types/database";

interface ProductCardProps {
  product: ProductRow;
  sourceType?: string;
  ctaLabel?: string;
}

export function ProductCard({ product, sourceType = "content", ctaLabel = "View Deal" }: ProductCardProps) {
  const destination = Buffer.from(product.affiliate_url).toString("base64");
  const trackUrl = `/api/track/click?p=${encodeURIComponent(product.slug)}&d=${encodeURIComponent(destination)}&t=${sourceType}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {product.image_url && (
        <div className="mb-3 overflow-hidden rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            className="h-40 w-full object-contain"
          />
        </div>
      )}
      <h3 className="mb-1 text-lg font-semibold leading-tight">{product.name}</h3>
      {product.merchant && (
        <p className="mb-1 text-sm text-gray-500">{product.merchant}</p>
      )}
      <div className="mb-3 flex items-center gap-3">
        {product.price && (
          <span className="text-lg font-bold text-emerald-600">{product.price}</span>
        )}
        {product.score !== null && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-800">
            {product.score}/10
          </span>
        )}
      </div>
      {product.affiliate_url && (
        <a
          href={trackUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block w-full rounded-md bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}
