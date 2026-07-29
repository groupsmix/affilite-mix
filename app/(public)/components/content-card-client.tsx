"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BookOpen,
  FileText,
  Scale,
  Star,
  Newspaper,
  Network,
  Coins,
  Gift,
  Image as ImageIcon,
  Calculator,
  UserCheck,
} from "lucide-react";
import { shimmerPlaceholder } from "@/lib/image-placeholder";
import type { ContentRow } from "@/types/database";

interface ContentCardImageProps {
  href: string;
  src?: string | null;
  alt: string;
  priority?: boolean;
  type?: ContentRow["type"];
  categorySlug?: string;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  guide: BookOpen,
  article: FileText,
  comparison: Scale,
  review: Star,
  blog: Newspaper,
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "crypto-tax-basics": BookOpen,
  "defi-tax": Network,
  "staking-tax": Coins,
  "airdrop-tax": Gift,
  "nft-tax": ImageIcon,
  "crypto-tax-software": Calculator,
  "crypto-accountants": UserCheck,
};

function FallbackIcon({
  type,
  categorySlug,
}: {
  type?: ContentRow["type"];
  categorySlug?: string;
}) {
  const Icon =
    (categorySlug && CATEGORY_ICONS[categorySlug]) || (type && TYPE_ICONS[type]) || BookOpen;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-slate-500">
      <Icon className="size-10" aria-hidden="true" />
    </div>
  );
}

export function ContentCardImage({
  href,
  src,
  alt,
  priority = false,
  type,
  categorySlug,
}: ContentCardImageProps) {
  const [imgError, setImgError] = useState(false);

  const image =
    src && !imgError ? (
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
        placeholder="blur"
        blurDataURL={shimmerPlaceholder(400, 250)}
        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        onError={() => setImgError(true)}
      />
    ) : null;

  const fallback = !image && <FallbackIcon type={type} categorySlug={categorySlug} />;

  return (
    <Link
      href={href}
      aria-label={alt}
      className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-muted"
    >
      {image ?? fallback}
    </Link>
  );
}
