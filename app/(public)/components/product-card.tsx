import type { ProductRow } from "@/types/database";
import Image from "next/image";

interface ProductCardProps {
  product: ProductRow;
  sourceType?: string;
  ctaLabel?: string;
}

function isDealActive(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) > new Date();
}

function getDealTimeLeft(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours}h left`;
}

export function ProductCard({ product, sourceType = "content", ctaLabel = "View Deal" }: ProductCardProps) {
  const destination = Buffer.from(product.affiliate_url).toString("base64");
  const trackUrl = `/api/track/click?p=${encodeURIComponent(product.slug)}&d=${encodeURIComponent(destination)}&t=${sourceType}`;
  const buttonLabel = product.cta_text || ctaLabel;
  const showDeal = product.deal_text && isDealActive(product.deal_expires_at);
  const dealTimeLeft = getDealTimeLeft(product.deal_expires_at);

  return (
    <div className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Deal badge */}
      {showDeal && (
        <div className="absolute -top-2 left-3 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
          {product.deal_text}
          {dealTimeLeft && (
            <span className="ml-1 text-red-100">· {dealTimeLeft}</span>
          )}
        </div>
      )}
      {product.image_url && (
        <div className="mb-3 overflow-hidden rounded-md">
          <Image
            src={product.image_url}
            alt={product.name}
            width={320}
            height={160}
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
          {buttonLabel}
        </a>
      )}
    </div>
  );
}
